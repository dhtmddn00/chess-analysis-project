'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, RefreshCw, Home, BarChart3 } from 'lucide-react';

interface FABProps {
  className?: string;
}

export default function FloatingActionButton({ className = '' }: FABProps) {
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const scrollToStats = () => {
    const statsElement = document.querySelector('[data-stats]');
    if (statsElement) {
      statsElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const refreshPage = () => {
    window.location.reload();
  };

  const actions = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home size={18} />,
      onClick: refreshPage,
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    {
      id: 'stats',
      label: 'System Stats',
      icon: <BarChart3 size={18} />,
      onClick: scrollToStats,
      color: 'bg-green-500 hover:bg-green-600'
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw size={18} />,
      onClick: refreshPage,
      color: 'bg-orange-500 hover:bg-orange-600'
    }
  ];

  if (!showScrollToTop) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-40 ${className}`}>
      {/* Action Menu */}
      <div className={`mb-4 space-y-3 transition-all duration-300 ${
        isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        {actions.map((action, index) => (
          <div
            key={action.id}
            className="flex items-center justify-end"
            style={{ 
              transitionDelay: isExpanded ? `${index * 50}ms` : '0ms' 
            }}
          >
            {/* Action Label */}
            <div className="mr-3 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-lg shadow-lg whitespace-nowrap opacity-90">
              {action.label}
            </div>
            
            {/* Action Button */}
            <button
              onClick={action.onClick}
              className={`
                w-12 h-12 rounded-full shadow-lg text-white
                transition-all duration-200 transform hover:scale-110 active:scale-95
                focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2
                ${action.color}
              `}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Main FAB */}
      <div className="relative">
        {/* Scroll to Top Button */}
        <button
          onClick={scrollToTop}
          className={`
            absolute inset-0 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg
            transition-all duration-300 transform hover:scale-105 active:scale-95
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${isExpanded ? 'opacity-0 rotate-180 scale-75' : 'opacity-100 rotate-0 scale-100'}
          `}
          aria-label="Scroll to top"
        >
          <ChevronUp size={24} className="mx-auto" />
        </button>

        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg
            transition-all duration-300 transform hover:scale-105 active:scale-95
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
            ${isExpanded ? 'opacity-100 rotate-45 scale-100' : 'opacity-0 rotate-0 scale-75'}
          `}
          aria-label={isExpanded ? 'Close actions menu' : 'Open actions menu'}
        >
          <div className="relative">
            {/* Plus icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-0.5 bg-white"></div>
              <div className="absolute w-0.5 h-6 bg-white"></div>
            </div>
          </div>
        </button>
      </div>

      {/* Backdrop */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}

// Mini FAB for simple actions
export function MiniFAB({ 
  icon, 
  onClick, 
  className = '', 
  color = 'bg-blue-500 hover:bg-blue-600',
  label 
}: { 
  icon: React.ReactNode; 
  onClick: () => void; 
  className?: string; 
  color?: string;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-12 h-12 rounded-full shadow-lg text-white
        transition-all duration-200 transform hover:scale-110 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2
        ${color} ${className}
      `}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}