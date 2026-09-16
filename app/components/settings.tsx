"use client";

import { useState, useEffect } from "react";
import { X, Film } from "lucide-react";
import GenreSelector from "./genreSelector";
import { useSolidSession } from "@/src/contexts/SolidSessionContext";
import { loadSettings, saveSettings, UserSettings } from "@/src/solid-storage";
import toast from "react-hot-toast";

interface SettingsModalProps {
    storageRoot?: string | null;
    isMandatory?: boolean;
    onClose: () => void;
    onSaveSuccess?: () => void;
}

export default function SettingsModal({ storageRoot, isMandatory = false, onClose, onSaveSuccess }: SettingsModalProps) {
    const { session } = useSolidSession();
    const [loading, setLoading] = useState(false);
    
    const [settings, setSettings] = useState<UserSettings>({
        ageRange: "18+", 
        genres: [], 
        favoriteDirectors: [], 
        favoriteActors: []
    });

    useEffect(() => {
        if (storageRoot) {
            loadSettings(storageRoot, session.fetch).then(data => {
                if (data) setSettings(data);
            });
        }
    }, [storageRoot, session.fetch]);

    const handleGenreToggle = (genreValue: string) => {
        if (settings.genres.includes(genreValue)) {
            setSettings({ ...settings, genres: settings.genres.filter((g) => g !== genreValue) });
        } else if (settings.genres.length < 3) {
            setSettings({ ...settings, genres: [...settings.genres, genreValue] });
        }
    };

    const handleSave = async () => {
        if (!storageRoot) return;
        if (settings.genres.length === 0) {
            toast.error("Please select at least one movie genre!");
            return;
        }
        setLoading(true);
        try {
            await saveSettings(storageRoot, {
                ageRange: settings.ageRange,
                genres: settings.genres,
                favoriteDirectors: settings.favoriteDirectors,
                favoriteActors: settings.favoriteActors
            }, session.fetch);
            
            toast.success("🎬 Preferences successfully saved to Solid Pod!");
            if (onSaveSuccess) onSaveSuccess();
            
            // Tutup modal setelah berhasil menyimpan
            onClose();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save settings.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            // Backdrop: hanya tutup jika diklik di area gelap DAN tidak mandatory
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
            onClick={(e) => {
                if (!isMandatory && e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            {/* 
               Modal Content: 
               e.stopPropagation() di sini SUDAH CUKUP untuk mencegah klik di dalam modal 
               memicu onClose pada backdrop. Tidak perlu diulang di tombol.
            */}
            <div 
                className="bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl p-6 w-full max-w-md text-white relative" 
                onClick={(e) => e.stopPropagation()} 
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Film className="text-[#ef4444]" size={24} />
                        {isMandatory ? "Welcome to NetPod!" : "Preference Settings"}
                    </h2>
                    
                    {/* ✅ Tombol X: Langsung panggil onClose() */}
                    {!isMandatory && (
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="text-[#94a3b8] hover:text-white hover:bg-[#334155] p-1.5 rounded-full transition-colors"
                            aria-label="Close settings"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
                
                {isMandatory && (
                    <p className="text-sm text-[#94a3b8] mb-6 leading-relaxed">
                        Let's personalize your movie recommendations. This will only take a minute.
                    </p>
                )}

                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-[#cbd5e1]">Age Range</label>
                        <select 
                            value={settings.ageRange} 
                            onChange={(e) => setSettings({...settings, ageRange: e.target.value})} 
                            className="bg-[#0f172a] border border-[#334155] text-white rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:border-transparent transition-all cursor-pointer"
                        >
                            <option value="under_12">Under 12 years (Children)</option>
                            <option value="13-17">13 - 17 years (Teenagers)</option>
                            <option value="18+">18+ years (Adults)</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-[#cbd5e1]">
                            Favorite Movie Genres (Max 3)
                        </label>
                        <GenreSelector 
                            selectedGenres={settings.genres} 
                            onGenreToggle={handleGenreToggle} 
                            maxSelection={3} 
                            showCount={true} 
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    {/* ✅ Tombol Cancel: Langsung panggil onClose() */}
                    {!isMandatory && (
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="px-5 py-2.5 rounded-lg bg-[#334155] text-[#cbd5e1] hover:bg-[#475569] hover:text-white transition-colors font-medium"
                        >
                            Cancel
                        </button>
                    )}
                    <button 
                        type="button"
                        onClick={handleSave} 
                        disabled={loading} 
                        className="px-5 py-2.5 rounded-lg bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg shadow-[#ef4444]/20 flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Saving...
                            </>
                        ) : (
                            isMandatory ? "Start Exploring" : "Save to Pod"
                        )}
                    </button>
                </div>
            </div> 
            {/* ✅ DIV BERLEBIHAN YANG SEBELUMNYA ADA DI SINI SUDAH DIHAPUS */}
        </div>
    );
}