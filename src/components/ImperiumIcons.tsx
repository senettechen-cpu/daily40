import React from 'react';

// Common props for consistency
interface IconProps {
    className?: string;
    size?: number;
    color?: string;
}

// 1. Imperial Guard (Astra Militarum) - Cadian Helmet Style
export const GuardsmanIcon: React.FC<IconProps> = ({ className = '', size = 24, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path
            d="M12 2C7 2 3 5 3 9V14C3 17 5 19 8 20L12 22L16 20C19 19 21 17 21 14V9C21 5 17 2 12 2ZM12 4C15.5 4 18.5 6 18.8 9H5.2C5.5 6 8.5 4 12 4ZM19 14C19 16 17.5 17.5 16 18L12 19.5L8 18C6.5 17.5 5 16 5 14V11H19V14Z"
            fill={color}
            fillOpacity="0.8"
        />
        <path d="M12 5V8" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M9 13L15 13" stroke={color} strokeWidth="1.5" />
    </svg>
);

// 2. Space Marine (Adeptus Astartes) - Power Armor Helmet (Mark VII Aquila style approximation)
export const MarineIcon: React.FC<IconProps> = ({ className = '', size = 24, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {/* Helmet Dome */}
        <path d="M12 2C7 2 4 6 4 10V16C4 19 6 21 9 22H15C18 21 20 19 20 16V10C20 6 17 2 12 2Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
        {/* Eye Lenses */}
        <path d="M5 14L9 16L11 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 14L15 16L13 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Grill / Vox Caster */}
        <path d="M10 18V21" stroke={color} strokeWidth="1.5" />
        <path d="M12 18V21" stroke={color} strokeWidth="1.5" />
        <path d="M14 18V21" stroke={color} strokeWidth="1.5" />
        {/* Brow Ridge */}
        <path d="M5 10C5 10 8 11 12 11C16 11 19 10 19 10" stroke={color} strokeWidth="2" />
    </svg>
);

// 3. Custodes (Adeptus Custodes) - Guardian Spear / High Helm
export const CustodesIcon: React.FC<IconProps> = ({ className = '', size = 24, color = '#fbbf24' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {/* Spear Blade */}
        <path d="M12 2L15 6L14 18H10L9 6L12 2Z" fill={color} fillOpacity="0.9" />
        {/* Crossguard */}
        <path d="M8 12H16" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Shaft */}
        <path d="M12 18V22" stroke={color} strokeWidth="2" />
        {/* Ornate Wing Detail */}
        <path d="M15 6C17 6 19 8 19 10" stroke={color} strokeWidth="1.5" />
        <path d="M9 6C7 6 5 8 5 10" stroke={color} strokeWidth="1.5" />
        {/* Gem */}
        <circle cx="12" cy="12" r="1.5" fill="#ef4444" />
    </svg>
);

// 4. Imperial Skull (General Symbol)
export const SkullIcon: React.FC<IconProps> = ({ className = '', size = 24, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M12 2C8 2 5 5 5 9C5 11.5 6.5 13.5 8 14.5V18C8 19 9 20 10 20H14C15 20 16 19 16 18V14.5C17.5 13.5 19 11.5 19 9C19 5 16 2 12 2Z"
            stroke={color} strokeWidth="2"
        />
        <circle cx="9" cy="9" r="2" fill={color} />
        <circle cx="15" cy="9" r="2" fill={color} />
        <path d="M10 16V18" stroke={color} strokeWidth="1.5" />
        <path d="M12 16V18" stroke={color} strokeWidth="1.5" />
        <path d="M14 16V18" stroke={color} strokeWidth="1.5" />
    </svg>
);
