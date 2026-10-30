import React from 'react';

/*
 * One icon set: Material Symbols Rounded (DESIGN.md). Icons render as a
 * ligature in that font, outlined at rest and filled when `filled` is set.
 *
 * The named exports keep the names the code imported from lucide-react and
 * @mui/icons-material, so a file only changes its import line. LEGACY maps
 * those names (also used in config: personas' `icon:`, `icon://<name>`) to
 * Material names; a config may also give a Material name directly.
 */
export const LEGACY = {
  // lucide-react
  Accessibility: 'accessible', AlertCircle: 'error', AlertTriangle: 'warning', ArrowLeft: 'arrow_back',
  ArrowLeftRight: 'swap_horiz', ArrowRight: 'arrow_forward', ArrowUp: 'arrow_upward', BarChart3: 'bar_chart',
  BookOpen: 'menu_book', Bookmark: 'bookmark', Brain: 'psychology', Briefcase: 'work', Calendar: 'calendar_today',
  CalendarDays: 'calendar_month', CalendarPlus: 'calendar_add_on', Check: 'check', CheckCircle: 'check_circle',
  ChevronDown: 'expand_more', ChevronLeft: 'chevron_left', ChevronRight: 'chevron_right', CircleHelp: 'help',
  ClipboardList: 'assignment', Clock: 'schedule', Cloud: 'cloud', Code2: 'code', Copy: 'content_copy',
  Cpu: 'memory', Download: 'download', ExternalLink: 'open_in_new', Eye: 'visibility', EyeOff: 'visibility_off',
  File: 'draft', FileText: 'description', Footprints: 'directions_walk', Globe: 'language',
  GraduationCap: 'school', Hash: 'tag', Heart: 'favorite', HelpCircle: 'help', Layers: 'layers',
  Lightbulb: 'lightbulb', List: 'list', Loader2: 'progress_activity', Lock: 'lock', LogOut: 'logout',
  Mail: 'mail', Map: 'map', MapPin: 'location_on', Maximize2: 'open_in_full', Menu: 'menu',
  MessageCircle: 'chat_bubble', MessageSquare: 'forum', Mic: 'mic', MicOff: 'mic_off',
  MoreHorizontal: 'more_horiz', Navigation: 'near_me', Paperclip: 'attach_file', Pencil: 'edit',
  PenTool: 'edit_note', Phone: 'call', Plus: 'add', Printer: 'print', RefreshCw: 'refresh', Reply: 'reply',
  Search: 'search', Send: 'send', Server: 'dns', Settings2: 'tune', Sparkles: 'auto_awesome',
  Target: 'target', Trash2: 'delete', TrendingUp: 'trending_up', Upload: 'upload', User: 'person',
  Users: 'group', Volume2: 'volume_up', VolumeX: 'volume_off', X: 'close',
  // @mui/icons-material
  AddCommentRounded: 'add_comment', AddRounded: 'add', ArrowBack: 'arrow_back', ArticleOutlined: 'article',
  ChatBubbleOutlineRounded: 'chat_bubble', CheckCircleOutlineRounded: 'check_circle',
  ChevronLeftRounded: 'chevron_left', ChevronRightRounded: 'chevron_right', Close: 'close',
  CloseRounded: 'close', DeleteOutlined: 'delete', DescriptionOutlined: 'description',
  DragIndicatorRounded: 'drag_indicator', DriveFileMoveRounded: 'drive_file_move', EditOutlined: 'edit',
  HomeOutlined: 'home', KeyboardTabRounded: 'keyboard_tab', LockOutlined: 'lock', Logout: 'logout',
  MoreHorizRounded: 'more_horiz', PersonOutlineRounded: 'person', PersonOutlined: 'person',
  PictureAsPdfOutlined: 'picture_as_pdf', RedoRounded: 'redo', SearchRounded: 'search',
  SettingsOutlined: 'settings', ShareOutlined: 'share', StarRounded: 'star', SwapHorizRounded: 'swap_horiz',
  TextSnippetOutlined: 'text_snippet', UndoRounded: 'undo', ViewSidebarOutlined: 'view_sidebar',
};

// Icons whose old look was solid.
const FILLED = new Set(['StarRounded']);
const MUI_SIZES = { small: 20, medium: 24, large: 35 };
const FALLBACK = 'person';

/**
 * A Material Symbols icon. `size` is in px (lucide's prop); `fontSize` takes
 * MUI's small/medium/large/inherit. Decorative unless `label` is given.
 */
export function Icon({
  name, size, fontSize, filled = false, label, className = '', style, color, sx,
  strokeWidth, absoluteStrokeWidth, fill, ...rest
}) {
  const px = size ?? (fontSize === 'inherit' ? 'inherit' : MUI_SIZES[fontSize] ?? 24);
  const solid = filled || (fill && fill !== 'none');
  return (
    <span
      className={`ms${solid ? ' ms-fill' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: px, ...(color ? { color } : null), ...(sx && typeof sx === 'object' ? sx : null), ...style }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      {...rest}
    >
      {name}
    </span>
  );
}

const named = (legacyName) => {
  const Component = (props) => (
    <Icon name={LEGACY[legacyName]} filled={FILLED.has(legacyName)} {...props} />
  );
  Component.displayName = `Icon(${legacyName})`;
  return Component;
};

/** A component for a config icon name: a legacy name, a Material name, or the fallback. */
export function resolveIconName(name) {
  if (!name) return FALLBACK;
  if (LEGACY[name]) return LEGACY[name];
  return /^[a-z0-9_]+$/.test(name) ? name : FALLBACK;
}

const byName = {};
export function iconFor(name) {
  const material = resolveIconName(name);
  if (!byName[material]) {
    const Component = (props) => <Icon name={material} {...props} />;
    Component.displayName = `Icon(${material})`;
    byName[material] = Component;
  }
  return byName[material];
}

export const AlertCircle = named('AlertCircle');
export const AlertTriangle = named('AlertTriangle');
export const ArrowLeft = named('ArrowLeft');
export const ArrowLeftRight = named('ArrowLeftRight');
export const ArrowRight = named('ArrowRight');
export const ArrowUp = named('ArrowUp');
export const BarChart3 = named('BarChart3');
export const BookOpen = named('BookOpen');
export const Bookmark = named('Bookmark');
export const Calendar = named('Calendar');
export const Check = named('Check');
export const CheckCircle = named('CheckCircle');
export const ChevronDown = named('ChevronDown');
export const ChevronLeft = named('ChevronLeft');
export const ChevronRight = named('ChevronRight');
export const Clock = named('Clock');
export const Code2 = named('Code2');
export const Copy = named('Copy');
export const Download = named('Download');
export const ExternalLink = named('ExternalLink');
export const Eye = named('Eye');
export const EyeOff = named('EyeOff');
export const File = named('File');
export const FileText = named('FileText');
export const GraduationCap = named('GraduationCap');
export const Layers = named('Layers');
export const List = named('List');
export const Loader2 = named('Loader2');
export const Lock = named('Lock');
export const Mail = named('Mail');
export const Map = named('Map');
export const MapPin = named('MapPin');
export const Menu = named('Menu');
export const MessageCircle = named('MessageCircle');
export const MessageSquare = named('MessageSquare');
export const Mic = named('Mic');
export const MicOff = named('MicOff');
export const MoreHorizontal = named('MoreHorizontal');
export const Paperclip = named('Paperclip');
export const Phone = named('Phone');
export const Plus = named('Plus');
export const RefreshCw = named('RefreshCw');
export const Reply = named('Reply');
export const Search = named('Search');
export const Send = named('Send');
export const Sparkles = named('Sparkles');
export const Trash2 = named('Trash2');
export const Upload = named('Upload');
export const User = named('User');
export const X = named('X');

export const AddRounded = named('AddRounded');
export const ArrowBack = named('ArrowBack');
export const ChatBubbleOutlineRounded = named('ChatBubbleOutlineRounded');
export const CheckCircleOutlineRounded = named('CheckCircleOutlineRounded');
export const ChevronLeftRounded = named('ChevronLeftRounded');
export const ChevronRightRounded = named('ChevronRightRounded');
export const Close = named('Close');
export const CloseRounded = named('CloseRounded');
export const DragIndicatorRounded = named('DragIndicatorRounded');
export const DriveFileMoveRounded = named('DriveFileMoveRounded');
export const LockOutlined = named('LockOutlined');
export const MoreHorizRounded = named('MoreHorizRounded');
export const PersonOutlineRounded = named('PersonOutlineRounded');
export const RedoRounded = named('RedoRounded');
export const SearchRounded = named('SearchRounded');
export const StarRounded = named('StarRounded');
export const SwapHorizRounded = named('SwapHorizRounded');
export const UndoRounded = named('UndoRounded');
