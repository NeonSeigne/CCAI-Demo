#!/usr/bin/env python3
"""Screenshot the app's mockup screens for one school, or compare two captures.

Signs in through the backend's dev login (ENABLE_DEV_LOGIN), opens each screen
in a fixed state and saves one full-page PNG per screen, school, theme and
width: <screen>-<school>-<theme>-<width>.png. At 390px it also lists every
visible icon-only button or link whose hit area is under 44x44px (design Q19);
these are printed, not fatal. Uses the gstack browse binary (BROWSE_BIN) with
its own daemon state, so it doesn't share a browser with anything else.

Screens and the mockup each maps to (designs/design-system-20261029/):
    ask-home          ask-home.html
    ask-chat          ask-chat.html (an existing chat; chat-*.html cards show
                      only if that chat has them, no message is sent)
    events            events.html
    event-detail      event-detail.html (?event=<first event from /api/events>)
    map               map.html
    map-place         map.html with a place selected (?to=<second place listed>)
    courses-browse    course-popup.html's page behind the pop-up
    course-popup      course-popup.html (?course=<first planned course>)
    degree-map        transit-a.html (desktop) / transit-b.html (phone)
    degree-semesters  My degree, Semesters view
    saved             Saved (shell only, no mockup page)
    menu-chat         menus.html "Chat" (chat header's More options)
    menu-course       menus.html "Program" (a course card's menu, My degree Semesters)

Usage (from the repo root; the app and backend must be running):
    backend/.venv/bin/python scripts/screens.py capture --school cu \\
        --app http://localhost:3000 --api http://localhost:8000 --label baseline-phase1
    backend/.venv/bin/python scripts/screens.py capture --school uw \\
        --app http://localhost:3002 --api http://localhost:8002 --label baseline-phase1 \\
        --widths 390 --themes light --screens ask-home,map-place
    backend/.venv/bin/python scripts/screens.py compare OLD_DIR NEW_DIR [--fail-over 0.5]

Output goes to ~/.gstack/projects/NeonSeigne-CCAI-Demo/screens/<label>/ unless
--out is given. Compare writes compare.html (pairs side by side with a diff
image and the share of changed pixels) into NEW_DIR/compare-<OLD name>/ unless
--out is given; it needs Pillow (backend/.venv has it).

Known limits: events and opening hours are live data, and the browser clock is
not frozen, so date-driven screens differ day to day.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = Path.home() / ".gstack/projects/NeonSeigne-CCAI-Demo/screens"
BROWSE_BIN = os.environ.get(
    "BROWSE_BIN", "browse"
)
# A browse daemon of its own, so other sessions' tabs and logins don't mix in.
BROWSE_STATE = os.environ.get(
    "BROWSE_STATE_FILE", str(Path.home() / ".gstack/screens-browse/browse.json")
)

WIDTHS = (390, 900, 1280, 1440)
HEIGHTS = {390: 844}  # everything else is 900 tall
THEMES = ("light", "dark")
SCREENS = (
    "ask-home", "ask-chat", "events", "event-detail", "map", "map-place",
    "courses-browse", "course-popup", "degree-map", "degree-semesters", "saved",
    "menu-chat", "menu-course",
)
SETTLE_MS = 700

# Stops transitions and caret blink so two runs of the same state match.
FREEZE_CSS = (
    "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;"
    "transition-duration:0s!important;transition-delay:0s!important;"
    "caret-color:transparent!important}"
)

SETTLE_JS = """(async () => {
await (document.fonts ? document.fonts.ready : Promise.resolve());
if (!document.getElementById('screens-freeze')) {
  const s = document.createElement('style');
  s.id = 'screens-freeze';
  s.textContent = %s;
  document.head.appendChild(s);
}
await new Promise((r) => setTimeout(r, %d));
return location.pathname + location.search;
})()""" % (json.dumps(FREEZE_CSS), SETTLE_MS)

# Icon-only = no visible text once icon glyphs (.ms ligatures), svg, img and
# .sr-only text are removed. Passes when the box is >= 44x44, or when every
# corner of a 44x44 square centred on it still hits the element (a padded
# ::before hit area counts).
HIT_CHECK_JS = """(() => {
const MIN = 44;
const out = [];
const nodes = document.querySelectorAll('button, [role="button"], a[href]');
for (const el of nodes) {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
  if (el.closest('[aria-hidden="true"], [inert]')) continue;
  let r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) continue;
  if (!el.querySelector('.ms, svg, img')) continue;
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.ms, svg, img, .sr-only').forEach((n) => n.remove());
  if (clone.textContent.trim()) continue;
  if (r.width >= MIN && r.height >= MIN) continue;
  if (r.bottom < 0 || r.top > innerHeight) { el.scrollIntoView({ block: 'center' }); r = el.getBoundingClientRect(); }
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = MIN / 2 - 1;
  const corners = [[cx - h, cy - h], [cx + h, cy - h], [cx - h, cy + h], [cx + h, cy + h]];
  const hits = corners.every(([x, y]) => {
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit));
  });
  if (hits) continue;
  const name = el.getAttribute('aria-label') || el.getAttribute('title')
    || (el.className && String(el.className)) || el.tagName.toLowerCase();
  out.push({ name, tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) });
}
return JSON.stringify(out);
})()"""


# ---------------------------------------------------------------- browse

def browse(*args, stdin=None):
    env = dict(os.environ, BROWSE_STATE_FILE=BROWSE_STATE)
    Path(BROWSE_STATE).parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [BROWSE_BIN, *args], input=stdin, capture_output=True, text=True, env=env,
        timeout=180,
    )
    return proc.returncode, proc.stdout + proc.stderr


def is_error(part):
    return part.split("] ", 1)[-1].startswith("ERROR")


def run_chain(steps):
    """Run browse commands in one round trip; return (ok, per-step outputs)."""
    code, out = browse("chain", stdin=json.dumps(steps))
    parts = [p.strip() for p in out.split("\n\n") if p.strip()]
    failed = code != 0 or any(is_error(p) for p in parts)
    return not failed, parts


def js_step(code):
    return ["js", code]


def click_js(selector):
    return js_step(
        "const el = document.querySelector(%s); if (!el) throw new Error('not found: ' + %s); "
        "el.click(); 'clicked'" % (json.dumps(selector), json.dumps(selector))
    )


def wait_js(ms):
    return js_step("await new Promise((r) => setTimeout(r, %d)); 'waited'" % ms)


# ---------------------------------------------------------------- api

def api(base, path, token=None, method="GET"):
    req = urllib.request.Request(base.rstrip("/") + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, data=b"" if method == "POST" else None, timeout=30) as res:
        return json.loads(res.read().decode() or "null")


def pick_ids(args, token):
    """The fixed state each screen opens: chat, event, course and place ids."""
    ids = {}
    if args.chat:
        ids["chat"] = args.chat
    else:
        sessions = api(args.api, "/api/chat-sessions", token) or []
        with_msgs = [s for s in sessions if s.get("message_count", 0) >= 2]
        # Oldest chat with an answer: new chats don't change which one is shown.
        with_msgs.sort(key=lambda s: s.get("created_at") or "")
        ids["chat"] = with_msgs[0]["id"] if with_msgs else None
    if args.event:
        ids["event"] = args.event
    else:
        events = (api(args.api, "/api/events", token) or {}).get("events") or []
        ids["event"] = events[0]["id"] if events else None
    if args.course:
        ids["course"] = args.course
    else:
        plan = (api(args.api, "/api/planner/plan", token) or {}).get("plan") or {}
        planned = [c["id"] for c in plan.get("courses") or []]
        done = [c["id"] for c in (plan.get("profile") or {}).get("completed") or []]
        ids["course"] = (planned + done or [None])[0]
    if args.place:
        ids["place"] = args.place
    else:
        # The first place is usually the start place itself (0 min); take the next.
        places = (api(args.api, "/api/places?limit=2", token) or {}).get("places") or []
        ids["place"] = places[-1]["id"] if places else None
    return ids


# ---------------------------------------------------------------- screens

def open_chat_js(session_id):
    # The app opens a chat from Home with navigate('/chat', {state: {sessionId}});
    # this is the same history entry React Router would push.
    return js_step(
        "const idx = (history.state && history.state.idx || 0) + 1;"
        "history.pushState({usr: {sessionId: %s}, key: 'screens', idx}, '', '/chat');"
        "dispatchEvent(new PopStateEvent('popstate', {state: history.state})); 'opened'"
        % json.dumps(session_id)
    )


def screen_plan(name, ids):
    """(path, degree view, steps after load) for a screen, or a reason it can't open."""
    q = urllib.parse.quote
    if name == "ask-home":
        return "/home", None, []
    if name in ("ask-chat", "menu-chat"):
        if not ids.get("chat"):
            return "/chat", None, []  # the empty chat page
        steps = [open_chat_js(ids["chat"]), wait_js(1500), ["wait", "--networkidle"]]
        if name == "menu-chat":
            steps += [js_step(SETTLE_JS), click_js('[aria-label="More options"]'), wait_js(300)]
        return "/home", None, steps
    if name == "events":
        return "/events", None, []
    if name == "event-detail":
        if not ids.get("event"):
            return None, None, "no events today"
        return "/events?event=" + q(ids["event"], safe=""), None, []
    if name == "map":
        return "/map", None, []
    if name == "map-place":
        if not ids.get("place"):
            return None, None, "no places"
        return "/map?to=" + q(ids["place"], safe=""), None, []
    if name == "courses-browse":
        return "/courses?view=browse", None, []
    if name == "course-popup":
        if not ids.get("course"):
            return None, None, "no course in the plan"
        return "/courses?view=browse&course=" + q(ids["course"], safe=""), None, []
    if name == "degree-map":
        return "/courses?view=degree", "map", []
    if name == "degree-semesters":
        return "/courses?view=degree", "semesters", []
    if name == "saved":
        return "/saved", None, []
    if name == "menu-course":
        return "/courses?view=degree", "semesters", [
            js_step(SETTLE_JS), click_js('[aria-label^="More for "]'), wait_js(300),
        ]
    raise ValueError(name)


def storage_js(token, user, theme, degree_view):
    sets = {
        "authToken": token,
        "user": json.dumps(user),
        "cc.theme.v1": theme,
    }
    if degree_view:
        sets["cc.degree.view.v1"] = degree_view
    body = "".join(
        "localStorage.setItem(%s, %s);" % (json.dumps(k), json.dumps(v)) for k, v in sets.items()
    )
    return js_step("localStorage.clear(); sessionStorage.clear();" + body + "'stored'")


def capture(args):
    out = Path(args.out or DEFAULT_ROOT / args.label).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    widths = [int(w) for w in args.widths.split(",")]
    themes = args.themes.split(",")
    screens = args.screens.split(",") if args.screens else list(SCREENS)
    unknown = [s for s in screens if s not in SCREENS]
    if unknown:
        sys.exit("unknown screen(s): " + ", ".join(unknown))

    login = api(args.api, "/auth/dev-login", method="POST")
    token, user = login["access_token"], login["user"]
    ids = pick_ids(args, token)
    print(f"[{args.school}] signed in as {user.get('email')}; state: {json.dumps(ids)}")

    app = args.app.rstrip("/")
    started = time.time()
    code, msg = browse("goto", app + "/")
    if code != 0:
        sys.exit(f"browse could not open {app}: {msg}")

    # browse only writes under the temp dirs and the repo; shots land here, then move.
    staging = Path(tempfile.mkdtemp(prefix="screens-"))
    manifest = {"school": args.school, "app": app, "api": args.api, "ids": ids,
                "widths": widths, "themes": themes, "shots": [], "hit_failures": []}
    failures = []
    for name in screens:
        path, degree_view, steps = screen_plan(name, ids)
        if path is None:
            print(f"  skip {name}: {steps}")
            manifest["shots"].append({"screen": name, "skipped": steps})
            continue
        for theme in themes:
            for width in widths:
                fname = f"{name}-{args.school}-{theme}-{width}.png"
                dest = out / fname
                staged = staging / fname
                chain = [
                    ["viewport", f"{width}x{HEIGHTS.get(width, 900)}"],
                    storage_js(token, user, theme, degree_view),
                    ["goto", app + path],
                    ["wait", "--networkidle"],
                    js_step(SETTLE_JS),
                    *steps,
                    js_step(SETTLE_JS),
                    ["screenshot", str(staged)],
                ]
                check = width == 390 and theme == themes[0]
                if check:
                    chain.append(js_step(HIT_CHECK_JS))
                ok, parts = run_chain(chain)
                landed = next((p.split("] ", 1)[1] for p in reversed(parts)
                               if p.startswith("[js]") and p.split("] ", 1)[-1].startswith("/")), "")
                signed_out = landed in ("/", "/auth") or landed.startswith("/auth?")
                record = {"screen": name, "theme": theme, "width": width, "file": fname,
                          "landed": landed, "ok": ok and not signed_out}
                if not ok or signed_out:
                    errors = [p for p in parts if is_error(p)]
                    record["error"] = "signed out" if signed_out else (errors or parts or ["?"])[0][:200]
                    # A screen whose state didn't open isn't kept, so compare can't pair it.
                    dest.unlink(missing_ok=True)
                    staged.unlink(missing_ok=True)
                elif staged.exists():
                    shutil.move(str(staged), dest)
                else:
                    record.update(ok=False, error="no screenshot written")
                manifest["shots"].append(record)
                if check and ok:
                    try:
                        found = json.loads(parts[-1].split("] ", 1)[1])
                    except (IndexError, ValueError):
                        found = []
                    for item in found:
                        item["screen"] = name
                        failures.append(item)
                print(f"  {'ok  ' if record['ok'] else 'FAIL'} {fname}"
                      + ("" if record["ok"] else ": " + record["error"].split("\n")[0]))

    shutil.rmtree(staging, ignore_errors=True)
    elapsed = time.time() - started
    manifest["seconds"] = round(elapsed, 1)
    manifest["hit_failures"] = failures
    (out / f"manifest-{args.school}.json").write_text(json.dumps(manifest, indent=2))

    print(f"\n[{args.school}] {sum(1 for s in manifest['shots'] if s.get('ok'))} images in "
          f"{elapsed:.0f}s -> {out}")
    if failures:
        print(f"[{args.school}] icon buttons under 44x44 at 390px (design Q19):")
        seen = {}
        for f in failures:
            key = (f["name"], f["w"], f["h"])
            seen.setdefault(key, []).append(f["screen"])
        for (label, w, h), where in sorted(seen.items()):
            print(f"  {w}x{h}  {label}  ({', '.join(sorted(set(where)))})")
    failed = [s["file"] for s in manifest["shots"] if s.get("ok") is False]
    if failed:
        print(f"[{args.school}] {len(failed)} screens didn't open: {', '.join(failed)}")
    return 1 if failed else 0


# ---------------------------------------------------------------- compare

def compare(args):
    try:
        from PIL import Image, ImageChops
    except ImportError:
        venv = REPO / "backend/.venv/bin/python"
        if venv.exists() and Path(sys.executable).resolve() != venv.resolve():
            os.execv(str(venv), [str(venv), *sys.argv])
        sys.exit("compare needs Pillow (backend/.venv/bin/python has it)")

    old, new = Path(args.old).expanduser(), Path(args.new).expanduser()
    out = Path(args.out or new / f"compare-{old.name}").expanduser()
    (out / "diff").mkdir(parents=True, exist_ok=True)
    a_names = {p.name for p in old.glob("*.png")}
    b_names = {p.name for p in new.glob("*.png")}
    rows = []
    for name in sorted(a_names & b_names):
        a = Image.open(old / name).convert("RGB")
        b = Image.open(new / name).convert("RGB")
        w, h = max(a.width, b.width), max(a.height, b.height)
        pa, pb = Image.new("RGB", (w, h), (255, 0, 255)), Image.new("RGB", (w, h), (0, 255, 0))
        pa.paste(a, (0, 0))
        pb.paste(b, (0, 0))
        diff = ImageChops.difference(pa, pb).convert("L")
        mask = diff.point(lambda v: 255 if v > args.tolerance else 0)
        changed = sum(mask.histogram()[255:])
        pct = 100.0 * changed / (w * h)
        overlay = Image.blend(pb, Image.new("RGB", (w, h), (255, 255, 255)), 0.7)
        overlay.paste((230, 0, 60), (0, 0), mask)
        overlay.save(out / "diff" / name)
        rows.append((pct, name, (a.width, a.height) != (b.width, b.height)))
    rows.sort(key=lambda r: (-r[0], r[1]))

    def rel(p):
        return os.path.relpath(p, out)

    html = [
        "<!doctype html><meta charset=utf-8><title>Screens compare</title>",
        "<style>body{font:14px system-ui;margin:16px;background:#f4f4f4;color:#111}"
        "h2{font-size:15px;margin:24px 0 8px}.over{color:#c00}"
        ".row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}"
        ".row img{width:100%;border:1px solid #ccc;background:#fff}"
        "td,th{padding:2px 10px;text-align:left}</style>",
        f"<h1>{old.name} vs {new.name}</h1>",
        f"<p>{len(rows)} pairs; tolerance {args.tolerance}/255 per pixel</p><table>",
        "<tr><th>changed</th><th>image</th></tr>",
    ]
    for pct, name, resized in rows:
        cls = " class=over" if args.fail_over is not None and pct > args.fail_over else ""
        html.append(f"<tr{cls}><td>{pct:.2f}%</td><td><a href='#{name}'>{name}</a>"
                    f"{' (size changed)' if resized else ''}</td></tr>")
    html.append("</table>")
    for only, names in (("only in " + old.name, a_names - b_names),
                        ("only in " + new.name, b_names - a_names)):
        if names:
            html.append(f"<h2>{only}</h2><p>{', '.join(sorted(names))}</p>")
    for pct, name, _ in rows:
        html.append(
            f"<h2 id='{name}'>{name}: {pct:.2f}%</h2><div class=row>"
            f"<img src='{rel(old / name)}' loading=lazy><img src='{rel(new / name)}' loading=lazy>"
            f"<img src='diff/{name}' loading=lazy></div>"
        )
    (out / "compare.html").write_text("\n".join(html))
    print(f"{len(rows)} pairs -> {out / 'compare.html'}")
    for pct, name, _ in rows[:10]:
        print(f"  {pct:6.2f}%  {name}")
    if args.fail_over is not None:
        over = [r for r in rows if r[0] > args.fail_over]
        if over:
            print(f"{len(over)} pairs changed more than {args.fail_over}%")
            return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)

    cap = sub.add_parser("capture", help="screenshot one school")
    cap.add_argument("--school", required=True, help="short name used in file names (cu, uw, uva)")
    cap.add_argument("--app", required=True, help="frontend base URL")
    cap.add_argument("--api", required=True, help="backend base URL")
    cap.add_argument("--label", default="latest", help="output folder name under the screens root")
    cap.add_argument("--out", help="output folder (overrides --label)")
    cap.add_argument("--widths", default=",".join(map(str, WIDTHS)))
    cap.add_argument("--themes", default=",".join(THEMES))
    cap.add_argument("--screens", help="comma-separated subset of: " + ", ".join(SCREENS))
    cap.add_argument("--chat", help="chat session id (default: oldest chat with an answer)")
    cap.add_argument("--event", help="event id (default: first from /api/events)")
    cap.add_argument("--course", help="course id (default: first planned course)")
    cap.add_argument("--place", help="place id (default: second from /api/places)")

    cmp_ = sub.add_parser("compare", help="side-by-side page with pixel diffs")
    cmp_.add_argument("old")
    cmp_.add_argument("new")
    cmp_.add_argument("--out", help="folder for compare.html (default: NEW/compare-<OLD name>)")
    cmp_.add_argument("--tolerance", type=int, default=16, help="per-pixel difference ignored (0-255)")
    cmp_.add_argument("--fail-over", type=float, help="exit 1 if any pair changes more than this %%")

    args = parser.parse_args()
    try:
        return capture(args) if args.cmd == "capture" else compare(args)
    except urllib.error.URLError as exc:
        sys.exit(f"backend not reachable: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
