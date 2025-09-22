import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Palette, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHybridMode } from '@/hooks/useHybridMode';
import { cn } from '@/lib/utils';

interface HybridModeToggleProps {
  className?: string;
}

/**
 * Floating toggle button for hybrid mode switching
 * Allows users to quickly switch between CMD and Enhanced modes
 * Always visible and can enable hybrid mode automatically
 */
export const HybridModeToggle: React.FC<HybridModeToggleProps> = ({
  className
}) => {
  const {
    displayMode,
    isHybridMode,
    isInCmdMode,
    isInEnhancedMode,
    hybridCurrentMode
  } = useHybridMode();
  
  // Debug: Monitor state changes (minimal logging)
  useEffect(() => {
    console.log(`[HybridToggle] Mode: ${displayMode} | In Hybrid: ${isHybridMode} | Sub-mode: ${isInCmdMode ? 'CMD' : 'Enhanced'}`);
    console.log(`[HybridToggle] 按钮应该显示在右上角，带有▶符号`);
  }, [displayMode, isHybridMode, isInCmdMode, hybridCurrentMode]);

  // Show different UI based on current mode
  const isInHybrid = isHybridMode;
  
  // Button click simulates Alt+T keypress for consistency
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Create and dispatch a synthetic Alt+T keyboard event
    const syntheticEvent = new KeyboardEvent('keydown', {
      key: 't',
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    
    document.dispatchEvent(syntheticEvent);
  };

  // Display logic based on current state
  let Icon, modeText, nextModeText, buttonTitle;
  
  if (!isInHybrid) {
    // Not in hybrid mode - show "Enable Hybrid" button
    Icon = Zap;
    modeText = displayMode.toUpperCase();
    nextModeText = 'Hybrid';
    buttonTitle = '启用混合模式 (Alt+T)';
  } else {
    // In hybrid mode - show current sub-mode
    Icon = isInCmdMode ? Terminal : Palette;
    modeText = isInCmdMode ? 'CMD' : 'Enhanced';
    nextModeText = isInCmdMode ? 'Enhanced' : 'CMD';
    buttonTitle = `切换到${nextModeText}模式 (Alt+T)`;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'fixed top-22 right-4 z-[9999] pointer-events-auto',
          '!important',
          className
        )}
        style={{
          position: 'fixed',
          top: '64px',
          right: '16px',
          zIndex: 9999
        }}
      >
        <Button
          onClick={handleToggle}
          variant="outline"
          size="sm"
          className={cn(
            'hybrid-toggle',
            'flex items-center gap-2 px-4 py-3',
            'border-4 font-mono font-bold',
            'transition-all duration-300 ease-in-out',
            'shadow-2xl hover:shadow-3xl transform hover:scale-110',
            'group rounded-xl',
            'animate-pulse',
            // Strong color contrast for each state
            !isInHybrid && 'bg-purple-600 text-white border-purple-300 hover:bg-purple-500',
            isInHybrid && isInCmdMode && 'bg-green-600 text-black border-green-300 hover:bg-green-500',
            isInHybrid && isInEnhancedMode && 'bg-blue-600 text-white border-blue-300 hover:bg-blue-500'
          )}
          title={buttonTitle}
        >
          <Icon className={cn(
            'h-4 w-4 transition-transform duration-200',
            'group-hover:scale-110'
          )} />
          <span className="text-sm font-mono font-black tracking-wider uppercase">
            ▶ {modeText}
          </span>
          <Zap className={cn(
            'h-3 w-3 transition-all duration-200',
            'opacity-50 group-hover:opacity-100',
            'group-hover:animate-pulse'
          )} />
        </Button>



        {/* Keyboard shortcut hint */}
        <motion.div
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
          className={cn(
            'absolute top-0 right-full mr-3',
            'px-3 py-2 text-xs font-mono',
            'bg-black text-white border border-gray-600 rounded-lg',
            'opacity-0 group-hover:opacity-100',
            'transition-opacity duration-200',
            'pointer-events-none',
            'whitespace-nowrap',
            'shadow-xl z-[9999]'
          )}
        >
          <div className="text-center">
            <div className="text-yellow-400 font-bold">Alt + T</div>
            <div className="text-gray-300 text-[10px] mt-1">
              {!isInHybrid ? '启用混合模式' : 
               isInCmdMode ? '切换到增强模式' : '切换到CMD模式'}
            </div>
          </div>
          {/* Arrow pointing right to button */}
          <div className="absolute top-1/2 -translate-y-1/2 left-full w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-black"></div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Performance badge component for display mode
 */
export const PerformanceBadge: React.FC<{
  mode: 'cmd' | 'enhanced' | 'hybrid';
  className?: string;
}> = ({ mode, className }) => {
  const getBadgeConfig = () => {
    switch (mode) {
      case 'cmd':
        return {
          text: '<100ms',
          color: 'text-green-400',
          bg: 'bg-green-400/10',
          border: 'border-green-400/30'
        };
      case 'enhanced':
        return {
          text: '增强',
          color: 'text-blue-400',
          bg: 'bg-blue-400/10',
          border: 'border-blue-400/30'
        };
      case 'hybrid':
        return {
          text: '混合',
          color: 'text-purple-400',
          bg: 'bg-purple-400/10',
          border: 'border-purple-400/30'
        };
      default:
        return {
          text: '默认',
          color: 'text-gray-400',
          bg: 'bg-gray-400/10',
          border: 'border-gray-400/30'
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1',
        'text-xs font-mono font-medium',
        'rounded-full border',
        config.color,
        config.bg,
        config.border,
        className
      )}
    >
      <div className={cn(
        'w-1.5 h-1.5 rounded-full',
        config.color.replace('text-', 'bg-'),
        'animate-pulse'
      )} />
      {config.text}
    </motion.div>
  );
};