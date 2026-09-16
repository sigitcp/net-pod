"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Settings, LogOut, History, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSolidSession } from "@/src/contexts/SolidSessionContext";
import SettingsModal from "./settings";

interface HeaderProps { 
    storageRoot?: string | null; 
}

export default function Header({ storageRoot }: HeaderProps) {
    const router = useRouter();
    const { session, logout } = useSolidSession();
    const [showSettings, setShowSettings] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = async () => {
        setShowMenu(false);
        await logout();
        router.push("/sign-in");
    };

    return (
        <>
            {showSettings && (
                <SettingsModal 
                    storageRoot={storageRoot} 
                    onClose={() => setShowSettings(false)} 
                />
            )}

            <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-[#0f172a]/95 border-b border-[#1e293b] backdrop-blur-md">
                {/* Logo */}
                <div className="logo cursor-pointer" onClick={() => router.push('/')}>
                    Net<span>Pod</span>
                </div>

                {/* Search Box */}
                <div className="search-box hidden md:flex">
                    <input
                        type="text"
                        placeholder="Cari film..."
                        onKeyDown={(e) => e.key === 'Enter' && router.push('/findMore')}
                    />
                    <button onClick={() => router.push('/findMore')}>
                        Search
                    </button>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => router.push("/findMore")} 
                        className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm font-bold hover:bg-[#dc2626] transition-colors"
                    >
                        <Sparkles size={16} />
                        Find More
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2.5 text-[#cbd5e1] hover:text-white hover:bg-[#334155] rounded-lg transition-colors"
                        title="Settings"
                    >
                        <Settings size={20} />
                    </button>

                    {/* Account Dropdown */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            title={session?.info?.webId || "Account"}
                            className="shuffle-btn flex items-center gap-2"
                            style={{ borderRadius: '8px', padding: '8px 12px' }}
                        >
                            <span className="truncate max-w-[120px] text-sm font-medium">
                                {session?.info?.webId ? new URL(session.info.webId).hostname : "Account"}
                            </span>
                            <ChevronDown className="w-4 h-4 shrink-0" />
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-[#1e293b] shadow-xl ring-1 ring-[#334155] z-50 overflow-hidden">
                                <div className="py-1">
                                    <button 
                                        onClick={() => { router.push("/findMore"); setShowMenu(false); }} 
                                        className="w-full text-left flex items-center gap-3 px-4 py-3 text-sm text-[#cbd5e1] hover:bg-[#334155] hover:text-white transition-colors"
                                    >
                                        <Sparkles size={16} />
                                        Find More Movies
                                    </button>
                                    <button 
                                        onClick={() => { router.push("/accountHistory"); setShowMenu(false); }} 
                                        className="w-full text-left flex items-center gap-3 px-4 py-3 text-sm text-[#cbd5e1] hover:bg-[#334155] hover:text-white transition-colors"
                                    >
                                        <History size={16} />
                                        History
                                    </button>
                                    
                                    <div className="border-t border-[#334155] my-1"></div>
                                    
                                    <button 
                                        onClick={handleLogout} 
                                        className="w-full text-left flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        Log out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </nav>
        </>
    );
}