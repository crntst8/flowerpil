/**
 * Top10 Onboarding Store
 *
 * Manages state for the 3-step onboarding flow:
 * 1. Email signup
 * 2. Display name
 * 3. URL import
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useOnboardingStore = create(
  persist(
    (set, get) => ({
      // Current step (1-3)
      currentStep: 1,

      // Form data
      email: '',
      displayName: '',
      playlistUrl: '',

      // Auth state
      isAuthenticated: false,
      verificationCode: '',
      awaitingVerification: false,
      userId: null,

      // Referral eligibility tracking
      attemptedDspImport: false,

      // UI state
      isLoading: false,
      error: null,

      // Actions
      setStep: (step) => set({ currentStep: step, error: null }),

      nextStep: () => set((state) => ({
        currentStep: Math.min(state.currentStep + 1, 3),
        error: null
      })),

      prevStep: () => set((state) => ({
        currentStep: Math.max(state.currentStep - 1, 1),
        error: null
      })),

      setEmail: (email) => set({ email }),
      setDisplayName: (displayName) => set({ displayName }),
      setPlaylistUrl: (playlistUrl) => set({ playlistUrl }),
      setVerificationCode: (verificationCode) => set({ verificationCode }),
      setAttemptedDspImport: (attemptedDspImport) => set({ attemptedDspImport }),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),

      setAwaitingVerification: (awaiting) => set({ awaitingVerification: awaiting }),
      setAuthenticated: (isAuthenticated, userId = null) => set({
        isAuthenticated,
        userId,
        awaitingVerification: false
      }),

      // Reset to initial state
      reset: () => set({
        currentStep: 1,
        email: '',
        displayName: '',
        playlistUrl: '',
        isAuthenticated: false,
        verificationCode: '',
        awaitingVerification: false,
        userId: null,
        attemptedDspImport: false,
        isLoading: false,
        error: null,
      }),

      // Get all form data
      getFormData: () => ({
        email: get().email,
        displayName: get().displayName,
        playlistUrl: get().playlistUrl,
      }),
    }),
    {
      name: 'top10-onboarding',
      partialize: (state) => ({
        currentStep: state.currentStep,
        email: state.email,
        displayName: state.displayName,
        playlistUrl: state.playlistUrl,
        isAuthenticated: state.isAuthenticated,
        userId: state.userId,
        attemptedDspImport: state.attemptedDspImport,
      }),
    }
  )
);

export default useOnboardingStore;
