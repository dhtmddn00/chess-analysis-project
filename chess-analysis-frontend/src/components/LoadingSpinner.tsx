'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'gray' | 'success' | 'error';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

export default function LoadingSpinner({
  size = 'md',
  color = 'primary',
  text,
  fullScreen = false,
  className = ''
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
    xl: 'w-16 h-16 border-4'
  };

  const colorClasses = {
    primary: 'border-blue-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-600 border-t-transparent',
    success: 'border-green-600 border-t-transparent',
    error: 'border-red-600 border-t-transparent'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  const spinner = (
    <div className={`inline-flex flex-col items-center justify-center ${className}`}>
      <div
        className={`
          animate-spin rounded-full
          ${sizeClasses[size]}
          ${colorClasses[color]}
        `}
        aria-label="Loading"
      />
      {text && (
        <div className={`mt-2 text-gray-600 dark:text-gray-400 ${textSizeClasses[size]}`}>
          {text}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

// Skeleton loading components
export function SkeletonBox({ 
  width = '100%', 
  height = '20px', 
  className = '' 
}: { 
  width?: string; 
  height?: string; 
  className?: string; 
}) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({ 
  lines = 3, 
  className = '' 
}: { 
  lines?: number; 
  className?: string; 
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBox
          key={i}
          width={i === lines - 1 ? '75%' : '100%'}
          height="16px"
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="animate-pulse">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-4">
          <SkeletonBox width="40px" height="40px" className="rounded-full" />
          <div className="flex-1">
            <SkeletonBox width="120px" height="16px" className="mb-2" />
            <SkeletonBox width="80px" height="14px" />
          </div>
        </div>
        
        {/* Content */}
        <SkeletonText lines={3} className="mb-4" />
        
        {/* Footer */}
        <div className="flex justify-between items-center">
          <SkeletonBox width="100px" height="32px" className="rounded" />
          <SkeletonBox width="80px" height="16px" />
        </div>
      </div>
    </div>
  );
}

// Pulse loading for buttons
export function LoadingButton({
  children,
  loading = false,
  disabled = false,
  size = 'md',
  variant = 'primary',
  className = '',
  ...props
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  [key: string]: any;
}) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    outline: 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
  };

  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`
        relative inline-flex items-center justify-center rounded-lg font-medium
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-60
        ${sizeClasses[size]}
        ${isDisabled ? 'opacity-60 cursor-not-allowed' : variantClasses[variant]}
        ${className}
      `}
    >
      {loading && (
        <LoadingSpinner
          size={size === 'lg' ? 'md' : 'sm'}
          color="white"
          className="mr-2"
        />
      )}
      <span className={loading ? 'opacity-75' : ''}>{children}</span>
    </button>
  );
}