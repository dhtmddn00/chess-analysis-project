'use client';

import { useState, useEffect, useRef } from 'react';
import { Menu, X, Home, BarChart3, Settings, Info, Github, ExternalLink } from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}

interface MobileMenuProps {
  items?: MenuItem[];
  onItemClick?: (item: MenuItem) => void;
}

const defaultItems: MenuItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: <Home size={20} />,
    onClick: () => window.location.reload()
  },
  {
    id: 'stats',
    label: 'System Stats',
    icon: <BarChart3 size={20} />,
    onClick: () => {
      const statsElement = document.querySelector('[data-stats]');
      if (statsElement) {
        statsElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  },
  {
    id: 'about',
    label: 'About',
    icon: <Info size={20} />,
    onClick: () => alert('Chess Analysis Pro - Advanced chess analysis powered by Stockfish engine')
  },
  {
    id: 'github',
    label: 'View Source',
    icon: <Github size={20} />,
    href: 'https://github.com',
    external: true
  }
];

export default function MobileMenu({ items = defaultItems, onItemClick }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleItemClick = (item: MenuItem) => {
    if (item.href) {
      if (item.external) {
        window.open(item.href, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = item.href;
      }
    } else if (item.onClick) {
      item.onClick();
    }

    if (onItemClick) {
      onItemClick(item);
    }

    setIsOpen(false);
  };

  return (
    <>
      {/* Simple Menu Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? (
          <X size={16} className="text-gray-600 dark:text-gray-400" />
        ) : (
          <Menu size={16} className="text-gray-600 dark:text-gray-400" />
        )}
      </button>

      {/* Minimal Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Simple Menu Panel */}
      <div
        ref={menuRef}
        className={`
          fixed top-16 right-6 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50
          transform transition-all duration-200
          ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
        `}
      >
        <nav className="p-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="w-full flex items-center space-x-3 px-3 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors group"
            >
              <span className="text-gray-500 dark:text-gray-400 group-hover:text-black dark:group-hover:text-white">
                {item.icon}
              </span>
              <span className="group-hover:text-black dark:group-hover:text-white">
                {item.label}
              </span>
              {item.external && (
                <ExternalLink size={12} className="text-gray-400 ml-auto" />
              )}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

// Hook for managing mobile menu state
export function useMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(prev => !prev);

  return {
    isOpen,
    openMenu,
    closeMenu,
    toggleMenu
  };
}