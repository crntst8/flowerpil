1. **URL Import**: ANY feature importing content from URLs MUST use `/api/v1/url-import/*`. Do not create platform-specific import UIs.
2. **Headers**: Use `ReusableHeader` for public pages. Never recreate headers from scratch.
3. **Buttons**: Import `Button` from curator UI system. Use variant props, not custom styles.
4. **Modals**: Use `ModalRoot` + `ModalSurface` from shared Modal component. Never create custom modal overlays.
5. **Images**: Use `ResponsiveImage` for all images. Never use raw `<img>` tags for content images.
6. **Forms**: Use `FormField`, `Input`, `Select`, `TextArea` from curator UI. Never create custom form styles.
7. **Layout**: Use `PageContainer`, `ContentWrapper`, `SectionCard` for page structure. Match existing page patterns.
8. **Icons**: Use `PlatformIcon` for DSP icons. Use `IconWithFallback` for custom action icons.
9. **Audio**: Use `AudioPreviewContext` and `PreviewButton`. Never create custom audio players.
10. **Admin Panels**: Use `CollapsibleSection` for grouping. Match existing admin panel patterns.
11. **Mobile First**: All components must work on 375px. Use `mediaQuery.mobile` for responsive adjustments.
12. **Touch Targets**: Minimum 44px for interactive elements. Use `tokens.sizing.touchTarget`.
13. **Spacing**: Use `tokens.spacing` or `theme.spacing`. Never use arbitrary pixel values.
14. **State**: For complex features, use Zustand stores. For simple local state, use useState.
15. **Linking**: After any playlist import, trigger cross-platform linking via `/api/v1/linker/playlists/:id/link`.
16. **No Duplicate Features**: Before building, search for existing implementations. Check `docs/features/`, component folders, and service files.
17. **Content Hierarchy**: TYPE/DATE (top, small) → ATTRIBUTION (middle) → TITLE (bottom, large).
18. **API Responses**: Always return `{ success: true/false, data/error }` format.
19. **Authenticated Requests**: Use `authenticatedFetch` from `useAuth()`. Never use raw `fetch` for auth endpoints.
20. **Error Handling**: Wrap async operations in try/catch. Show user-friendly errors via `StatusBanner` or toast.
21. **Feed Cards**: Copy `FeedPlaylistCard.jsx` structure for any new card-based listing. Image left, content right, genre chips below title.
22. **Genre Chips**: Border + text same color, transparent background, square corners, uppercase. Use `parseGenreTags()` + `genreLookup.resolve()`.
23. **Content Flags**: Colored tabs hanging from card top. No top border. Extend on hover. Link to `/content-tag/{slug}`.
24. **Text Hierarchy**: Always DATE (tiny) → ATTRIBUTION (medium) → TITLE (large). Never invert this order.
25. **Hero + List**: Feature pages use hero section (image + metadata) then list section. Background color change separates them.
26. **Brutalist Shadows**: Curator UI uses `4px 4px 0 #000` hard shadows. Public site uses softer multi-layer shadows.
27. **Square Corners**: Most UI elements have `border-radius: 0`. Only modals and special components use rounded corners.
28. **Image Hover**: Cards with images should scale image slightly on hover (`transform: scale(1.05)`).
29. **Helvetica Neue**: Titles use Helvetica Neue. Labels/metadata use Paper Mono. Never use other fonts.
30. **Genre Resolution**: Always use the `useGenreCatalog` hook + `createGenreLookup` to resolve genre tags. This gives you colors and proper labels.