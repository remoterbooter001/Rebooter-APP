import React from 'react';
import { ChevronLeftIcon, MenuIcon } from './icons';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack, onMenuClick }) => {
  return (
    <header className="bg-white dark:bg-gray-800 p-4 shadow-md flex items-center sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
      {onBack ? (
         <button onClick={onBack} className="mr-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronLeftIcon />
         </button>
      ) : onMenuClick ? (
         <button onClick={onMenuClick} className="mr-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <MenuIcon />
         </button>
      ) : null}
      <h1 className="text-xl font-bold truncate">{title}</h1>
    </header>
  );
};

export default Header;