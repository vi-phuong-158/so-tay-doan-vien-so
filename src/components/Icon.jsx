import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  House,
  KeyRound,
  Lightbulb,
  LogOut,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  Download,
  UserRound,
  UsersRound
} from 'lucide-react';

const ICONS = {
  home: House,
  house: House,
  work: ClipboardList,
  clipboard: ClipboardList,
  book: BookOpen,
  'book-open': BookOpen,
  bulb: Lightbulb,
  lightbulb: Lightbulb,
  user: UserRound,
  'user-round': UserRound,
  bell: Bell,
  search: Search,
  calendar: CalendarDays,
  file: FileText,
  'file-text': FileText,
  check: CircleCheck,
  clock: Clock3,
  sparkles: Sparkles,
  send: Send,
  upload: Upload,
  download: Download,
  filter: SlidersHorizontal,
  'sliders-horizontal': SlidersHorizontal,
  chevron: ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  arrow: ArrowRight,
  logout: LogOut,
  shield: ShieldCheck,
  users: UsersRound,
  'users-round': UsersRound,
  chart: ChartNoAxesColumn,
  settings: Settings,
  key: KeyRound,
  plus: Plus,
  alert: TriangleAlert
};

export function Icon({ name, size = 21, className = '' }) {
  const IconComponent = ICONS[name] || FileText;

  return (
    <IconComponent
      className={`icon ${className}`.trim()}
      size={size}
      strokeWidth={1.9}
      aria-hidden="true"
      focusable="false"
    />
  );
}
