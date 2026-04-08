'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

const { colors, images, text } = siteConfig;
const login = text.login;

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSSOLogin = () => {
        signIn('azure-ad', { callbackUrl: '/' });
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        
        setLoading(true);
        setError('');
        
        const res = await signIn('credentials', { password, redirect: false });
        if (res?.error) {
            setError('Invalid password. Please try again.');
            setLoading(false);
        } else if (res?.ok) {
            window.location.href = '/';
        }
    };

    return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-[#162a1e] to-slate-950 relative overflow-hidden">

            {/* Subtle background glow */}
            <div
                className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-3xl pointer-events-none"
                style={{ backgroundColor: `${colors.loginBgGlow}1A` }}
            />

            {/* Login Card */}
            <div className="relative z-10 w-full px-4 sm:max-w-md sm:px-0">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 md:px-8 md:py-10 flex flex-col items-center gap-7">

                    {/* Logo */}
                    <div className="flex flex-col items-center gap-5">
                        <div
                            className="relative h-16 w-16 rounded-xl overflow-hidden"
                            style={{ boxShadow: `0 0 40px ${colors.loginGlow}` }}
                        >
                            <Image
                                src={images.logo}
                                alt={text.appName}
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                                {login.title}
                            </h1>
                            <p className="text-sm text-slate-400 mt-1">
                                {login.subtitle}
                            </p>
                        </div>
                    </div>

                    {/* SSO Button */}
                    <button
                        onClick={handleSSOLogin}
                        className="w-full min-h-[48px] flex items-center justify-center gap-3 text-white font-semibold py-3 px-5 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
                        style={{
                            backgroundColor: colors.brandPrimary,
                            boxShadow: `0 10px 15px -3px ${colors.brandPrimary}4D`,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.brandPrimaryHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.brandPrimary)}
                    >
                        <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                        </svg>
                        {login.ssoButton}
                    </button>

                    {/* Divider */}
                    <div className="w-full flex items-center gap-4">
                        <div className="h-[1px] flex-1 bg-white/10" />
                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">or</span>
                        <div className="h-[1px] flex-1 bg-white/10" />
                    </div>

                    {/* Password Form */}
                    <form onSubmit={handlePasswordLogin} className="w-full flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <input
                                type="password"
                                placeholder="Backup password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                className="w-full bg-slate-950/50 border border-white/10 text-white placeholder-slate-500 text-sm rounded-xl px-4 py-3 outline-none focus:border-[#307c4c] focus:ring-1 focus:ring-[#307c4c] transition-all disabled:opacity-50"
                            />
                            {error && <p className="text-red-400 text-xs mt-1 px-1 font-medium">{error}</p>}
                        </div>
                        
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="w-full min-h-[48px] bg-slate-800 hover:bg-slate-700 text-white text-sm sm:text-base font-semibold py-3 px-5 rounded-xl transition-all border border-white/5 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : "Login with Password"}
                        </button>
                    </form>

                    {/* Footer */}
                    <p className="text-slate-500 text-xs text-center">
                        {login.footer}
                    </p>

                </div>
            </div>
        </div>
    );
}
