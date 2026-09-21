/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'void-black': '#0a0a0a',
                'imperial-gold': '#fbbf24',
                'mechanicus-red': '#ef4444',
                'warp-purple': '#a855f7',
                'nurgle-green': '#10b981',
            },
        },
    },
    plugins: [],
}
