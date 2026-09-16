'use client';

import React, { useState, useEffect } from 'react';
import { useSolidSession } from '@/src/contexts/SolidSessionContext';
import toast, { Toaster } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Film } from 'lucide-react';

export default function SignInPage() {
    const [oidcIssuer, setOidcIssuer] = useState('https://login.inrupt.com');
    const { session, isLoggedIn } = useSolidSession();
    const router = useRouter();

    useEffect(() => {
        if (isLoggedIn) {
            router.replace('/');
        }
    }, [isLoggedIn, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await session.login({
                oidcIssuer,
                redirectUrl: window.location.origin,
                clientName: 'NetPod App'
            });
        } catch (error) {
            toast.error('Login failed. Please check the OIDC provider.');
            console.error(error);
        }
    };

    return (
        <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-[#0f172a]">
            <Toaster position="bottom-right" toastOptions={{
                style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' }
            }} />
            
            <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center">
                <div className="flex justify-center mb-4">
                    <Film className="text-[#ef4444]" size={48} />
                </div>
                <h1 className="text-2xl font-bold text-white">
                    NetPod Sign-in
                </h1>
                <p className="mt-2 text-sm text-[#94a3b8]">
                    Connect your Solid Pod to access personalized recommendations.
                </p>
            </div>

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div>
                        <label htmlFor="oidc_provider" className="block text-sm font-medium leading-6 text-[#cbd5e1]">
                            OIDC Provider
                        </label>
                        <div className="mt-2">
                            <input
                                id="oidc_provider"
                                name="oidc_provider"
                                type="text"
                                required
                                value={oidcIssuer}
                                onChange={(e) => setOidcIssuer(e.target.value)}
                                placeholder="https://login.inrupt.com"
                                className="block w-full rounded-md border-0 py-3 px-3 bg-[#1e293b] text-white shadow-lg ring-1 ring-inset ring-[#334155] placeholder:text-[#64748b] focus:ring-2 focus:ring-inset focus:ring-[#ef4444] sm:text-sm sm:leading-6 transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <button 
                            type="submit" 
                            className="flex w-full justify-center rounded-md bg-[#ef4444] px-6 py-3 text-base font-semibold leading-6 text-white shadow-lg shadow-[#ef4444]/20 hover:bg-[#dc2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef4444] transition-all"
                        >
                            Sign in to Solid
                        </button>
                    </div>
                </form>
            </div>
            
            <div className="mt-10 text-center">
                <p className="text-xs text-[#64748b]">
                    Powered by Solid POD & Smart Recommendation Algorithm
                </p>
            </div>
        </div>
    );
}