"""
Centralized application configuration.

Reads ``config.yaml`` from the project root (two levels above this file) and
validates it with Pydantic models.  Every setting falls back to environment
variables when the YAML value is empty, so existing ``.env`` workflows keep
working.
"""

import os
import re
import logging
import colorsys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from colorhash import ColorHash

import httpx
import yaml
from pydantic import BaseModel, validator, field_validator, Field, model_validator

from app.utils.avatar_helpers import get_bundled_avatar_path
from app.version import __version__

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class _IconValidatorMixin(BaseModel):
    """Validates that the ``icon`` field is a known Lucide icon name."""

    @model_validator(mode="after")
    def _validate_icon(self):
        from app.utils.lucide_icons import get_valid_icon_names

        valid = get_valid_icon_names()
        if valid and self.icon not in valid:
            raise ValueError(
                f"Unknown icon {self.icon!r}. "
                f"Must be a valid Lucide icon name."
            )
        return self


class FeatureConfig(_IconValidatorMixin):
    title: str = ""
    description: str = ""
    icon: str = "HelpCircle"


THEME_ROLES = (
    "deep", "deep_raised", "on_deep", "on_deep_soft",
    "signal", "signal_hover", "on_signal",
    "tint", "tint_strong", "tint_ink",
    "band", "mark_bg", "mark_ink", "canvas",
    "line_1", "line_2", "line_3",
)
# Shared data colours a school may override when its brand colour clashes
# with one (UVA's orange vs student life, UW's red vs "harder").
THEME_OVERRIDES = ("academics", "life", "campus", "easier", "typical", "harder")
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class ThemeConfig(BaseModel):
    """A school's colours (DESIGN.md): one set of roles for light, one for dark.

    The frontend writes each role as a CSS variable (``deep_raised`` becomes
    ``--deep-raised``) and builds the MUI theme from the same values.
    """
    light: Dict[str, str]
    dark: Dict[str, str]

    @field_validator("light", "dark")
    @classmethod
    def _roles(cls, value, info):
        missing = [r for r in THEME_ROLES if r not in value]
        if missing:
            raise ValueError(f"theme.{info.field_name} is missing {', '.join(missing)}")
        unknown = [k for k in value if k not in THEME_ROLES and k not in THEME_OVERRIDES]
        if unknown:
            raise ValueError(f"theme.{info.field_name} has unknown roles: {', '.join(unknown)}")
        bad = [k for k, v in value.items() if not isinstance(v, str) or not _HEX.match(v)]
        if bad:
            raise ValueError(f"theme.{info.field_name} needs #RRGGBB or #RRGGBBAA for: {', '.join(bad)}")
        return {k: v.upper() for k, v in value.items()}


class AppConfig(BaseModel):
    title: str = "Advisor Canvas"
    subtitle: str = "AI-Powered Guidance"
    theme: Optional[ThemeConfig] = None
    logo_icon: str = "GraduationCap"
    institution: str = ""
    # Short school name for the rail and phone header ("UVA", "CU Boulder").
    short_name: str = ""
    footer_text: str = ""


class StarterGroup(BaseModel):
    """Sample questions on the home page, grouped by domain."""
    domain: str
    title: str
    prompts: List[str] = []


class HomepageConfig(BaseModel):
    starters: List[StarterGroup] = []
    headline_prefix: str = "Get Guidance from"
    headline_highlight: str = "Advisor Personas"
    description: str = ""
    features_title: str = "Why Choose Our Advisory Panel?"
    features: List[FeatureConfig] = []


class AcademicStage(BaseModel):
    value: str = ""
    label: str = ""


class LoginConfig(BaseModel):
    subtitle: str = "Sign in to continue"
    signup_subtitle: str = "Create your account to get personalized guidance from expert advisors"
    academic_stages: List[AcademicStage] = []


class ExampleCategory(_IconValidatorMixin):
    id: Optional[str] = None
    title: str
    icon: str = "BookOpen"
    color: str = "#3B82F6"
    bg_color: str = "#EFF6FF"
    suggestions: List[str] = []
    advisor_ids: List[str] = []


class ChatPageConfig(BaseModel):
    placeholder: str = "Ask your advisors anything..."
    examples: List[ExampleCategory] = []


class OnboardingConfig(BaseModel):
    features: List[FeatureConfig] = []
    tour_title: str = ""
    tour_body: str = ""


class CanvasConfig(BaseModel):
    tour_title: str = "Academic Progress Canvas"
    tour_body: str = "Review your extracted insights, degree roadmaps, and academic goals"


class PersonaItemConfig(_IconValidatorMixin):
    id: str
    name: str
    enabled: bool = True
    role: str = ""
    summary: str = ""
    color: Optional[str] = None
    bg_color: Optional[str] = None
    dark_color: Optional[str] = None
    dark_bg_color: Optional[str] = None
    icon: str = "HelpCircle"
    avatar: Optional[str] = None
    temperature: int = 5
    persona_prompt: str = ""

    @model_validator(mode='after')
    def _auto_generate_colors(self):
        if self.color is None:
            generated = generate_persona_colors(self.name)
            self.color = generated["color"]
            self.bg_color = generated["bg_color"]
            self.dark_color = generated["dark_color"]
            self.dark_bg_color = generated["dark_bg_color"]
        return self

    def _resolve_image(self) -> str:
        """Resolve the persona's visual representation as a URI string.

        Returns the avatar as a URI the frontend can dispatch on by scheme:

        - ``https://…`` / ``http://…`` - external image URL
        - ``/api/avatars/bundled/…`` - server-relative path for a bundled file
        - ``icon://<LucideIconName>`` - render a Lucide icon component

        Falls back to ``icon://`` when a bundled avatar name doesn't match a
        file on disk or when an external URL is unreachable.
        """
        if self.avatar is None:
            return f"icon://{self.icon}"
        if self.avatar.startswith(("http://", "https://")):
            try:
                resp = httpx.head(self.avatar, timeout=5, follow_redirects=True)
                if resp.is_success:
                    return self.avatar
                logger.warning(
                    "Avatar URL %r returned status %d for persona %r, falling back to icon.",
                    self.avatar, resp.status_code, self.id,
                )
            except httpx.HTTPError as exc:
                logger.warning(
                    "Avatar URL %r unreachable for persona %r (%s), falling back to icon.",
                    self.avatar, self.id, exc,
                )
            return f"icon://{self.icon}"
        if get_bundled_avatar_path(self.avatar) is None:
            logger.warning(
                "Bundled avatar %r not found for persona %r, falling back to icon.",
                self.avatar, self.id,
            )
            return f"icon://{self.icon}"
        return f"/api/avatars/bundled/{self.avatar}"

    def to_frontend_config(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "summary": self.summary,
            "color": self.color,
            "bg_color": self.bg_color,
            "dark_color": self.dark_color,
            "dark_bg_color": self.dark_bg_color,
            "image": self._resolve_image(),
            }


class PersonasConfig(BaseModel):
    base_prompt: str = ""
    personas_dir: str = ""
    config_dir: str = ""
    items: List[PersonaItemConfig] = []
    allowed_advisors: Optional[List[str]] = None

    @model_validator(mode='after')
    def _validate_allowed_advisors(self):
        if self.allowed_advisors is not None and len(self.allowed_advisors) == 0:
            raise ValueError(
                "allowed_advisors must not be an empty list; "
                "omit the setting or set to null to allow all advisors"
            )
        return self

    @model_validator(mode='after')
    def _load_personas_from_directory(self):
        if self.personas_dir:
            dir_path = Path(self.personas_dir)
            if not dir_path.is_absolute() and self.config_dir:
                dir_path = Path(self.config_dir) / dir_path
            loaded = load_personas_from_dir(str(dir_path))
            if loaded:
                self.items = loaded
                logger.info(f"Loaded {len(loaded)} personas.")
            else:
                logger.warning(f"No personas found in {self.personas_dir}. falling back to personas.items config")
        return self


class OrchestratorConfig(BaseModel):
    min_words_without_keywords: int = 6
    specific_keywords: List[str] = []
    clarification_questions: List[str] = [
            "Could you provide more details about what you need help with?"]
    clarification_suggestions: List[str] = [
            "Provide more details about your question."]

    @model_validator(mode="after")
    def validate_clarificaiton_questions(self):
        if len(self.clarification_questions) < 1:
            raise ValueError("At least one clarification question is required.")
        return self


class AuthConfig(BaseModel):
    jwt_secret: str = Field(default=os.getenv("JWT_SECRET_KEY", ""))
    algorithm: str = "HS256"
    token_expiry_minutes: int = 43200  # 30 days

    @model_validator(mode="after")
    def _validate_jwt_secret(self):
        if not self.jwt_secret:
            logger.warning(
                    "Insecure default JWT secret will be used. "
                    "Set auth.jwt_secret in config.yaml for production use.")
            self.jwt_secret = "your-secret-key-change-me"
        return self


class MongoDBConfig(BaseModel):
    connection_string: str = Field(default=os.getenv("MONGODB_CONNECTION_STRING")) 
    database_name: str = "phd_advisor"

    @model_validator(mode="after")
    def _warn_connection_envvar(self):
        if os.getenv("MONGODB_CONNECTION_STRING"):
            if self.connection_string != os.getenv("MONGODB_CONNECTION_STRING"):
                logger.warning(
                    "MONGODB_CONNECTION_STRING envvar is overridden in "
                    "config.yaml"
                )
            else:
                logger.warning(
                    "MongoDB connection string not set in config.yaml. "
                    "Falling back to MONGODB_CONNECTION_STRING envvar."
                )
        return self


class GeminiConfig(BaseModel):
    enabled: bool = True
    api_key: str = Field(default=os.getenv("GEMINI_API_KEY"))
    model: str = "gemini-2.5-flash"

    @model_validator(mode="after")
    def _warn_gemini_envvar(self):
        if os.getenv("GEMINI_API_KEY"):
            if self.api_key != os.getenv("GEMINI_API_KEY"):
                logger.warning(
                    "GEMINI_API_KEY envvar is overridden in config.yaml"
                )
            else:
                logger.warning(
                    "Gemini API key not set in config.yaml. "
                    "Falling back to GEMINI_API_KEY environment variable."
                )
        return self


class OllamaConfig(BaseModel):
    enabled: bool = True
    model: str = "llama3.2:1b"
    # TODO: Drop support for `OLLAMA_BASE_URL` envvar handling
    base_url: str = Field(default=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))


class VllmConfig(BaseModel):
    enabled: bool = True
    api_url: str = ""
    api_key: str = Field(default=os.getenv("VLLM_API_KEY", ""))
    # Empty: use the first model the endpoint lists.
    model: str = ""

    @model_validator(mode="after")
    def _apply_env_overrides(self):
        # Local runs point any OpenAI-compatible server (e.g. Ollama) here
        # without editing the school config.
        self.api_url = os.getenv("VLLM_API_URL") or self.api_url
        self.model = os.getenv("VLLM_MODEL") or self.model
        return self


class BrainForgeConfig(BaseModel):
    api_url: str = ""
    username: str = Field(default=os.getenv("BRAINFORGE_USERNAME", ""))
    password: str = Field(default=os.getenv("BRAINFORGE_PASSWORD", ""))
    sync_interval_seconds: int = 600


class LLMConfig(BaseModel):
    default_backend: str = ""
    gemini: GeminiConfig = GeminiConfig()
    ollama: OllamaConfig = OllamaConfig()
    vllm: VllmConfig = VllmConfig()
    brainforge: BrainForgeConfig = BrainForgeConfig()
    health_check_interval_seconds: int = 300


class SnapshotConfig(BaseModel):
    """Public CSV exports for the ``csv_snapshot`` academics provider."""
    sections_url: str = ""
    # Sections files by term label ("Spring 2027"), for the planner. The
    # chat tools keep reading ``sections_url``, which counts as its own term.
    sections_by_term: Dict[str, str] = {}
    grades_urls: List[str] = []
    source_name: str = ""
    source_url: str = ""
    refresh_hours: int = 24


class AcademicsConfig(BaseModel):
    """Which provider answers the course tools for this school."""
    provider: Literal["uw_coursemap", "csv_snapshot"] = "uw_coursemap"
    snapshot: SnapshotConfig = SnapshotConfig()


class CreditLimits(BaseModel):
    min: float
    max: float


class TermDates(BaseModel):
    """First and last day of classes of one term, from the school's official
    academic calendar. A date that couldn't be verified is left out."""
    first_day: Optional[date] = None
    last_day: Optional[date] = None

    @model_validator(mode="after")
    def _ordered(self):
        if self.first_day and self.last_day and self.last_day < self.first_day:
            raise ValueError(f"term_dates: last_day {self.last_day} is before first_day {self.first_day}")
        return self


class PlannerConfig(BaseModel):
    """Semester planner settings a school pack may set; all optional."""
    # A course whose average GPA is below this reads "harder". Unset: the
    # provider uses the hardest third of its own grade data, or unknown.
    harder_below_gpa: Optional[float] = None
    # Full-time minimum and the most a student may take without approval.
    credit_limits: Optional[CreditLimits] = None
    credit_limits_source: str = ""
    # Terms the school's live source covers, e.g. ["Fall 2026", "Spring 2027"].
    # Snapshot schools take theirs from academics.snapshot.sections_by_term.
    terms: List[str] = []
    # The term students plan for now; unset: the first covered term that
    # hasn't started yet.
    next_term: str = ""
    # First and last day of classes by term label ("Fall 2026"), from the
    # official academic calendar (the pack cites it). "Your classes today"
    # shows only on weekdays inside them and hides when either is missing.
    term_dates: Dict[str, TermDates] = {}


class EventFeedConfig(BaseModel):
    url: str
    name: str = ""
    # Feeds that cut off after N events (today.wisc.edu) are read as several
    # pages: ``limit=200&page=1..pages`` is added to the URL.
    pages: int = Field(default=1, ge=1, le=10)


EventKind = Literal["academic", "campus_life", "arts", "athletics", "career"]


class StudentLifeConfig(BaseModel):
    """Campus event calendars (iCal) for the events tools."""
    event_feeds: List[EventFeedConfig] = []
    refresh_minutes: int = 15
    # Feed category values (CATEGORIES, Trumba "Event Type") -> event kind,
    # matched without case. An event none of whose values is listed has no kind.
    event_kinds: Dict[str, EventKind] = {}


class CampusConfig(BaseModel):
    """Campus places for the find_place tool."""
    osm_area: Dict[str, Any] = {}
    places_file: str = ""
    # Campus map and Events start from this place (name or place id) until a
    # student picks their own; the map opens on default_category.
    default_origin: str = ""
    default_category: str = ""


class RAGConfig(BaseModel):
    embedding_model: str = "all-MiniLM-L6-v2"
    chroma_collection: str = "phd_advisor_documents"


class ToolsConfig(BaseModel):
    model_config = {"extra": "allow"}

    def get_enabled_names(self) -> List[str]:
        """Return tool names whose config has ``enabled: true``."""
        return [
            name
            for name, cfg in self.__pydantic_extra__.items()
            if isinstance(cfg, dict) and cfg.get("enabled", True)
        ]

    def get_tool_config(self, name: str) -> Dict[str, Any]:
        """Return the raw config dict for a single tool, or ``{}``."""
        cfg = self.__pydantic_extra__.get(name, {})
        return cfg if isinstance(cfg, dict) else {}

    @model_validator(mode="after")
    def _require_rmp_school_id(self):
        """Fail fast when the RateMyProfessor tool is enabled without a
        ``school_id``.  This tool is locked to a single school per deployment,
        so a missing ID is a configuration error rather than a runtime no-op."""
        cfg = self.get_tool_config("rate_my_professor")
        if cfg and cfg.get("enabled", True) and not cfg.get("school_id"):
            raise ValueError(
                "tools.rate_my_professor is enabled but 'school_id' is missing. "
                "Set the school_id for this deployment (find it with "
                "scripts/rmp_school_lookup.py) or disable the tool."
            )
        return self


class VoiceConfig(BaseModel):
    stt_endpoint: str = "https://whisper.neonaiservices.com"
    tts_endpoint: str = "https://coqui.neonaiservices.com"


class SchoolConfig(BaseModel):
    """Identity of a school pack (``schools/<slug>/school.yaml``).

    Empty for legacy single-file configs loaded through ``CONFIG_PATH``.
    """
    slug: str = ""
    timezone: str = ""
    status: Literal["draft", "active"] = "active"

    @validator("timezone")
    def _valid_timezone(cls, value):
        if value:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError(
                    f"school.timezone '{value}' is not an IANA timezone "
                    "(for example 'America/Denver')."
                ) from exc
        return value


class AppSettings(BaseModel):
    """Top-level container that mirrors the YAML structure."""
    app: AppConfig = AppConfig()
    homepage: HomepageConfig = HomepageConfig()
    login: LoginConfig = LoginConfig()
    chat_page: ChatPageConfig = ChatPageConfig()
    onboarding: OnboardingConfig = OnboardingConfig()
    canvas: CanvasConfig = CanvasConfig()
    personas: PersonasConfig = PersonasConfig()
    orchestrator: OrchestratorConfig = OrchestratorConfig()
    auth: AuthConfig = AuthConfig()
    mongodb: MongoDBConfig = MongoDBConfig()
    llm: LLMConfig = LLMConfig()
    rag: RAGConfig = RAGConfig()
    tools: ToolsConfig = ToolsConfig()
    voice: VoiceConfig = VoiceConfig()
    school: SchoolConfig = SchoolConfig()
    academics: AcademicsConfig = AcademicsConfig()
    planner: PlannerConfig = PlannerConfig()
    student_life: StudentLifeConfig = StudentLifeConfig()
    campus: CampusConfig = CampusConfig()

    @model_validator(mode="after")
    def _require_school_isolation(self):
        """A school pack must set a timezone and its own data stores, so one
        school's documents and chats never answer for another."""
        if not self.school.slug:
            return self
        if not self.school.timezone:
            raise ValueError(f"School pack '{self.school.slug}' must set school.timezone.")
        if self.mongodb.database_name == MongoDBConfig().database_name:
            raise ValueError(
                f"School pack '{self.school.slug}' must set mongodb.database_name "
                "(it still uses the shared default)."
            )
        if self.rag.chroma_collection == RAGConfig().chroma_collection:
            raise ValueError(
                f"School pack '{self.school.slug}' must set rag.chroma_collection "
                "(it still uses the shared default)."
            )
        return self

    @model_validator(mode="after")
    def _require_real_campus_defaults(self):
        """``campus.default_origin`` must name a place on the campus map and
        ``campus.default_category`` must have at least one place, so the
        Events and Campus map pages never open on nothing."""
        campus = self.campus
        if not (campus.default_origin or campus.default_category):
            return self
        from app.sources import places  # local: places imports this module

        label = self.school.slug or "config"
        path = SCHOOLS_DIR / self.school.slug / campus.places_file if campus.places_file else None
        try:
            loaded = places.read_file(path) if path else []
        except (OSError, ValueError, TypeError) as exc:
            raise ValueError(
                f"School pack '{label}' sets campus defaults but its places file can't be read ({exc})."
            ) from exc
        if campus.default_origin and places.find_in(loaded, campus.default_origin) is None:
            raise ValueError(
                f"School pack '{label}': campus.default_origin '{campus.default_origin}' "
                "is not a place in its places file (use a place name or id)."
            )
        if campus.default_category and not any(p["category"] == campus.default_category for p in loaded):
            raise ValueError(
                f"School pack '{label}': campus.default_category '{campus.default_category}' "
                "has no places in its places file."
            )
        return self

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def get_frontend_config(self) -> dict:
        """Return the subset of configuration safe to expose to the frontend
        via ``GET /api/config``.  Secrets are excluded."""
        allowed = self.personas.allowed_advisors
        persona_items = self.personas.items
        if allowed is not None:
            allowed_set = set(allowed)
            persona_items = [p for p in persona_items if p.id in allowed_set]

        return {
            "app": self.app.dict(),
            "school": {
                "slug": self.school.slug,
                "timezone": self.school.timezone,
                "term_dates": {
                    term: {
                        "first_day": d.first_day.isoformat() if d.first_day else None,
                        "last_day": d.last_day.isoformat() if d.last_day else None,
                    }
                    for term, d in self.planner.term_dates.items()
                },
            },
            "homepage": self.homepage.dict(),
            "login": self.login.dict(),
            "chat_page": self.chat_page.dict(),
            "onboarding": self.onboarding.dict(),
            "canvas": self.canvas.dict(),
            "personas": {
                "items": [p.to_frontend_config() for p in persona_items],
            },
            "version": __version__,
        }


# ---------------------------------------------------------------------------
# Singleton loader
# ---------------------------------------------------------------------------

_settings: Optional[AppSettings] = None


# Directory holding school packs (``<slug>/school.yaml``).
SCHOOLS_DIR = Path(os.getenv("SCHOOLS_DIR") or Path(__file__).resolve().parents[2] / "schools")


def _resolve_config_path() -> Optional[str]:
    """Pick the config file from ``SCHOOL`` or the legacy ``CONFIG_PATH``."""
    school = os.getenv("SCHOOL")
    legacy = os.getenv("CONFIG_PATH")
    if school and legacy:
        raise ValueError(
            "Set either SCHOOL or CONFIG_PATH, not both "
            f"(SCHOOL={school}, CONFIG_PATH={legacy})."
        )
    if school:
        path = SCHOOLS_DIR / school / "school.yaml"
        if not path.exists():
            raise FileNotFoundError(f"No school pack for SCHOOL={school} at {path}")
        return str(path)
    return legacy


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _read_config(path: Path) -> tuple:
    """Read a YAML config, applying its optional ``base:`` file first.

    ``base`` is resolved relative to the file and deep-merged underneath it,
    so a school pack only states what differs. Returns ``(raw, config_dir)``
    where ``config_dir`` is the directory persona paths resolve against (the
    base file's directory when a base is used).
    """
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found at {path}")
    logger.info(f"Loading configuration from {path}")
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    base = raw.pop("base", None)
    if not base:
        return raw, path.parent
    base_raw, base_dir = _read_config((path.parent / base).resolve())
    return _deep_merge(base_raw, raw), base_dir


def _check_school_status(raw: Dict[str, Any]) -> None:
    school = raw.get("school") or {}
    if school.get("status") == "draft" and os.getenv("ALLOW_DRAFT") != "1":
        raise ValueError(
            f"School pack '{school.get('slug', '')}' is a draft; set ALLOW_DRAFT=1 "
            "to run it, or set school.status: active after review."
        )


def load_settings(config_path: Optional[str] = None) -> AppSettings:
    """Load and validate ``config.yaml``, returning an ``AppSettings`` object.

    The result is cached as a module-level singleton so subsequent calls are
    free.  Pass *config_path* to override the auto-detected location (useful
    for tests).
    """
    global _settings
    if _settings is not None:
        return _settings

    if config_path is None:
        config_path = _resolve_config_path()
    if not config_path:
        logger.warning("No CONFIG_PATH or SCHOOL specified. Using default values")
        raw = {}
        config_dir = None
    else:
        raw, config_dir = _read_config(Path(config_path))

    if config_dir:
        raw.setdefault("personas", {})["config_dir"] = str(config_dir)
    _check_school_status(raw)

    _settings = AppSettings(**raw)
    logger.info(f"Configuration loaded: app.title={_settings.app.title}")
    return _settings


def get_settings() -> AppSettings:
    """Return the cached settings singleton (loads on first call)."""
    return load_settings()


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def load_personas_from_dir(personas_dir: str) -> List[PersonaItemConfig]:
    """Load persona configs from individual YAML files in a directory.
    
    Each file is validated independently — invalid files are skipped with a
    warning.  Duplicate ids/names and disabled personas are filtered out.
    """

    dir_path = Path(personas_dir)
    if not dir_path.is_dir():
        logger.warning(f"Personas directory not found: {personas_dir}")
        return []

    personas: List[PersonaItemConfig] = []
    seen_ids: dict[str, str] = {}     # id -> filename that defined it
    seen_names: dict[str, str] = {}   # name -> filename that defined it

    # sorting files alphabetically ensures consistent and predictable loading order
    for filepath in sorted(dir_path.glob("*.yaml")):
        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                raw = yaml.safe_load(fh) or {}
            persona = PersonaItemConfig(**raw)
        except Exception as exc:
            logger.warning(f"Skipping invalid persona file {filepath.name}: {exc}")
            continue

        if not persona.enabled:
            logger.info(f"Persona '{persona.id}' is disabled, skipping")
            continue

        if persona.id in seen_ids:
            logger.warning(
                f"Duplicate persona id '{persona.id}' in {filepath.name} "
                f"(already defined in {seen_ids[persona.id]}), skipping"
            )
            continue

        if persona.name in seen_names:
            logger.warning(
                f"Duplicate persona name '{persona.name}' in {filepath.name} "
                f"(already defined in {seen_names[persona.name]}), skipping"
            )
            continue

        seen_ids[persona.id] = filepath.name
        seen_names[persona.name] = filepath.name
        personas.append(persona)

    logger.info(f"Loaded {len(personas)} persona(s) from {personas_dir}")
    return personas


def generate_persona_colors(name: str) -> dict:
    """Deterministically generate four theme colors from a persona name."""

    ch = ColorHash(name.lower(), lightness=[0.55], saturation=[0.65])
    hue = ch.hsl[0]  # grab the hue colorhash picked
    h = hue / 360

    def hsl_to_hex(h, s, l):
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"

    return {
        "color":         hsl_to_hex(h, 0.65, 0.55),
        "bg_color":      hsl_to_hex(h, 0.60, 0.95),
        "dark_color":    hsl_to_hex(h, 0.70, 0.70),
        "dark_bg_color": hsl_to_hex(h, 0.65, 0.25),
    }
