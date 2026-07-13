/**
 * The icons a founder can put on a landing feature card.
 *
 * A curated list, not all of lucide. An open icon field would mean typing exact
 * component names and getting a blank card when you typo one. Every entry here
 * is guaranteed to render.
 *
 * Icon choice is stored as the string key, so adding an icon later never
 * invalidates content that is already saved.
 */

import {
  Lock, Shield, Eye, EyeOff, BarChart3, LineChart, PieChart, TrendingUp,
  FileText, Files, FolderLock, Users, UserCheck, Handshake, Rocket, Target,
  Zap, Clock, Bell, Calendar, Mail, Link2, Globe, Sparkles, CheckCircle2,
  Gauge, Layers, Building2, Wallet, type LucideIcon,
} from 'lucide-react';

export const FEATURE_ICONS: Record<string, LucideIcon> = {
  lock: Lock,
  shield: Shield,
  eye: Eye,
  'eye-off': EyeOff,
  'folder-lock': FolderLock,
  'bar-chart': BarChart3,
  'line-chart': LineChart,
  'pie-chart': PieChart,
  'trending-up': TrendingUp,
  gauge: Gauge,
  'file-text': FileText,
  files: Files,
  layers: Layers,
  users: Users,
  'user-check': UserCheck,
  handshake: Handshake,
  building: Building2,
  wallet: Wallet,
  rocket: Rocket,
  target: Target,
  zap: Zap,
  sparkles: Sparkles,
  check: CheckCircle2,
  clock: Clock,
  bell: Bell,
  calendar: Calendar,
  mail: Mail,
  link: Link2,
  globe: Globe,
};

export const FEATURE_ICON_KEYS = Object.keys(FEATURE_ICONS);

/** Returns null for an unset or unknown key, so the card simply renders without
 *  an icon rather than crashing on content saved before this existed. */
export function featureIcon(key?: string): LucideIcon | null {
  if (!key) return null;
  return FEATURE_ICONS[key] ?? null;
}
