'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Upload,
  History,
  Calendar,
  GitCompareArrows,
  MapPin,
  Receipt,
  Fuel,
  Truck,
  CreditCard,
  HelpCircle,
  ClipboardCheck,
  BarChart3,
  Settings,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Upload Centre', href: '/upload', icon: Upload },
  { name: 'Import History', href: '/imports', icon: History },
  { name: 'Invoice Periods', href: '/periods', icon: Calendar },
  { divider: true, label: 'Assurance' },
  { name: 'Reconciliation', href: '/reconciliation', icon: GitCompareArrows },
  { name: 'Telematics', href: '/telematics', icon: MapPin },
  { name: 'Transactions', href: '/transactions', icon: Receipt },
  { divider: true, label: 'Master Data' },
  { name: 'Approved Stations', href: '/stations', icon: Fuel },
  { name: 'Vehicles', href: '/vehicles', icon: Truck },
  { name: 'Cards & Equipment', href: '/cards', icon: CreditCard },
  { divider: true, label: 'Workflow' },
  { name: 'Mapping Queue', href: '/mapping-queue', icon: HelpCircle },
  { name: 'Review Queue', href: '/review-queue', icon: ClipboardCheck },
  { divider: true, label: 'Output' },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { divider: true, label: 'System' },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Audit Log', href: '/audit', icon: ScrollText },
] as const;

type NavItem =
  | { name: string; href: string; icon: React.ComponentType<{ className?: string }>; divider?: never; label?: never }
  | { divider: true; label: string; name?: never; href?: never; icon?: never };

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col border-r border-surface-300 bg-surface-50 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-surface-300 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <Shield className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col animate-fade-in">
            <span className="text-sm font-bold text-surface-950 tracking-tight">Fuel Assurance</span>
            <span className="text-2xs text-surface-500">Reconciliation Platform</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {(navigation as readonly NavItem[]).map((item, index) => {
          if ('divider' in item && item.divider) {
            if (collapsed) {
              return <div key={index} className="my-3 border-t border-surface-300" />;
            }
            return (
              <div key={index} className="pt-4 pb-1 px-3">
                <span className="text-2xs font-semibold text-surface-500 uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
            );
          }

          if (!item.href || !item.icon) return null;

          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                isActive ? 'nav-item-active' : 'nav-item',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.name : undefined}
            >
              <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-400' : 'text-surface-500')} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-surface-300 p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="nav-item w-full justify-center"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
