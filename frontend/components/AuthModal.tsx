"use client";

import React, { useState } from "react";
import { X, Lock, Mail, User, LogIn, UserPlus, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { authApi, UserResponse } from "@/services/api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserResponse | null;
  onUserChanged: (user: UserResponse | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged,
}) => {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await authApi.login(loginId, password);
      onUserChanged(res.user);
      setSuccessMsg(`Welcome back, ${res.user.username}!`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await authApi.register(email, username, password);
      onUserChanged(res.user);
      setSuccessMsg(`Account created for ${res.user.username}!`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    authApi.logout();
    onUserChanged(null);
    setSuccessMsg("Logged out successfully");
    setTimeout(() => {
      setSuccessMsg(null);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-dark-900 border border-dark-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-electric-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {currentUser ? (
          // Logged In View
          <div className="space-y-6 pt-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-electric-600 to-violet-600 flex items-center justify-center text-white font-bold text-lg">
                {currentUser.username[0].toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{currentUser.username}</h3>
                <p className="text-xs text-gray-400 font-mono">{currentUser.email}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-dark-800/60 border border-dark-700 text-xs text-gray-300 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Account Status:</span>
                <span className="text-emerald-400 font-medium">Active Member</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">User ID:</span>
                <span className="font-mono text-gray-400">{currentUser.id.slice(0, 13)}...</span>
              </div>
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-gray-300 hover:text-white hover:bg-dark-700 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          // Auth Forms View
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">AI Piano Studio Account</h3>
              <p className="text-xs text-gray-400 mt-1">
                Save projects, customize SoundFonts, and access your renders from anywhere.
              </p>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 p-1 bg-dark-800/80 rounded-xl border border-dark-700 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setError(null);
                }}
                className={`py-2 rounded-lg transition-all ${
                  tab === "login"
                    ? "bg-electric-500 text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setError(null);
                }}
                className={`py-2 rounded-lg transition-all ${
                  tab === "register"
                    ? "bg-electric-500 text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-300 font-medium mb-1.5">Email or Username</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="alex or alex@example.com"
                      className="w-full bg-dark-800 border border-dark-700 rounded-xl py-2.5 pl-10 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-electric-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-dark-800 border border-dark-700 rounded-xl py-2.5 pl-10 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-electric-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 hover:from-electric-400 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-electric-500/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-300 font-medium mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-dark-800 border border-dark-700 rounded-xl py-2.5 pl-10 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-electric-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1.5">Username</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="pianist123"
                      className="w-full bg-dark-800 border border-dark-700 rounded-xl py-2.5 pl-10 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-electric-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full bg-dark-800 border border-dark-700 rounded-xl py-2.5 pl-10 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-electric-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 hover:from-electric-400 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-electric-500/25 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="pt-2 border-t border-dark-800 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-electric-400 underline transition-colors"
              >
                Or continue in Guest Mode (no sign in required)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
