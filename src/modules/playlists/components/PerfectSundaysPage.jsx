import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ModalRoot, ModalSurface, ModalBody, ModalCloseButton } from '@shared/components/Modal/Modal.jsx';
import PlatformIcon from '@shared/components/PlatformIcon';
import { getPerfectSundaysPage } from '../services/playlistService';
import styles from './PerfectSundaysPage.module.css';

const DEFAULT_CONFIG = {
  title: 'Perfect Sundays',
  description: '',
  playlist_ids: [],
  mega_playlist_links: {
    spotify: '',
    apple: '',
    tidal: ''
  },
  megaplaylist_title: 'megaplaylist',
  megaplaylist_image: ''
};

const formatTitleLines = (title) => {
  if (!title) return [];

  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines = [];

  for (let i = 0; i < words.length; i += 2) {
    lines.push(words.slice(i, i + 2).join(' '));
  }

  return lines;
};

// Animation variants
const headerVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.25, 0.1, 0.25, 1]
    }
  }
};

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15
    }
  }
};

const tileVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.25, 0.1, 0.25, 1]
    }
  }
};

const PerfectSundaysPage = () => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await getPerfectSundaysPage();
        setConfig({ ...DEFAULT_CONFIG, ...(result?.config || {}) });
        setPlaylists(Array.isArray(result?.playlists) ? result.playlists : []);
      } catch (err) {
        console.error('Failed to load Perfect Sundays', err);
        setError('Failed to load Perfect Sundays');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Set document title
  useEffect(() => {
    document.title = 'Perfect Sundays - flowerpil.io';
    return () => {
      document.title = 'flowerpil.io';
    };
  }, []);

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) => {
      const aTitle = (a.display_title || a.title || '').toLowerCase();
      const bTitle = (b.display_title || b.title || '').toLowerCase();
      return aTitle.localeCompare(bTitle);
    });
  }, [playlists]);

  const megaLinks = config.mega_playlist_links || {};
  const hasMegaLinks = Object.values(megaLinks).some((v) => typeof v === 'string' && v.trim().length > 0);

  return (
    <div className={styles.page}>
      <header className={styles.perfHeader}>
        <div className={styles.perfHeaderContent}>
          <Link to="/home" className={styles.perfLogoLink}>
            <img src="/logo.png" alt="Flowerpil" className={styles.perfLogo} />
          </Link>
          <Link to="/home" className={styles.headerAction}>
            MORE PLAYLISTS -&gt;
          </Link>
        </div>
      </header>

      <main className={styles.body}>
        <motion.div
          className={styles.headerRow}
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.12
              }
            }
          }}
        >
          <motion.h1 className={styles.pageTitle} variants={headerVariants}>
            {config.title}
          </motion.h1>
          {config.description && (
            <motion.p className={styles.description} variants={headerVariants}>
              {config.description}
            </motion.p>
          )}
        </motion.div>

        {loading && <div className={styles.message}>Loading playlists…</div>}
        {error && <div className={styles.message}>{error}</div>}

        {!loading && !error && (
          <motion.div
            className={styles.fullBleedGrid}
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            {sortedPlaylists.map((playlist) => {
              const titleLines = formatTitleLines(playlist.display_title || playlist.title);

              return (
                <motion.div key={playlist.id} className={styles.tile} variants={tileVariants}>
                  <motion.div
                    whileHover={{
                      scale: 1.02,
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                      transition: { duration: 0.25, ease: 'easeOut' }
                    }}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <Link
                      to={`/playlists/${playlist.id}?from=perf`}
                      state={{ fromPerf: true }}
                      className={styles.tileLink}
                    >
                      {playlist.image ? (
                        <img
                          src={playlist.image_url_large || playlist.image}
                          alt={playlist.title}
                          loading="lazy"
                          className={styles.tileImage}
                        />
                      ) : (
                        <div className={styles.tileFallback}>No artwork</div>
                      )}
                      <div className={styles.overlay}>
                        <div className={styles.overlayText}>
                          {titleLines.map((line, idx) => (
                            <span key={`${playlist.id}-line-${idx}`} className={styles.overlayLine}>
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                </motion.div>
              );
            })}

          </motion.div>
        )}

        {!loading && !error && hasMegaLinks && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className={styles.megaplaylistContainer}
          >
            <motion.button
              type="button"
              onClick={() => setShowModal(true)}
              className={styles.megaplaylistButton}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.2 }}
            >
              {config.megaplaylist_image ? (
                <div className={styles.megaplaylistImageContainer}>
                  <motion.img
                    src={config.megaplaylist_image}
                    alt={config.megaplaylist_title || 'Megaplaylist'}
                    className={styles.megaplaylistImage}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                  <div className={styles.megaplaylistOverlay}>
                    <motion.div
                      className={styles.megaplaylistText}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                    >
                      {config.megaplaylist_title || 'megaplaylist'}
                    </motion.div>
                    <motion.div
                      className={styles.megaplaylistArrow}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4, duration: 0.4 }}
                    >
                      →
                    </motion.div>
                  </div>
                </div>
              ) : (
                <div className={styles.megaplaylistFallback}>
                  <motion.div
                    className={styles.megaplaylistText}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                  >
                    {config.megaplaylist_title || 'megaplaylist'}
                  </motion.div>
                  <motion.div
                    className={styles.megaplaylistArrow}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                  >
                    →
                  </motion.div>
                </div>
              )}
            </motion.button>
          </motion.div>
        )}
      </main>

      {showModal && (
        <ModalRoot
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          align="center"
          overlayProps={{ $backdrop: 'rgba(0,0,0,0.7)' }}
        >
          <ModalSurface>
            <ModalCloseButton onClick={() => setShowModal(false)} />
            <ModalBody>
              <motion.h3
                className={styles.modalTitle}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {config.megaplaylist_title || 'Perfect Sundays Megaplaylist'}
              </motion.h3>
              {hasMegaLinks ? (
                <motion.div
                  className={styles.linkList}
                  initial="hidden"
                  animate="visible"
                  variants={{
                    visible: {
                      transition: {
                        staggerChildren: 0.08
                      }
                    }
                  }}
                >
                  {megaLinks.spotify && (
                    <motion.a
                      href={megaLinks.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.dspLink}
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: { duration: 0.3 }
                        }
                      }}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={styles.dspLinkContent}>
                        <PlatformIcon platform="spotify" size={28} />
                        <span className={styles.dspLinkLabel}>Spotify</span>
                      </div>
                      <span className={styles.dspLinkArrow}>→</span>
                    </motion.a>
                  )}
                  {megaLinks.apple && (
                    <motion.a
                      href={megaLinks.apple}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.dspLink}
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: { duration: 0.3 }
                        }
                      }}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={styles.dspLinkContent}>
                        <PlatformIcon platform="apple" size={28} />
                        <span className={styles.dspLinkLabel}>Apple Music</span>
                      </div>
                      <span className={styles.dspLinkArrow}>→</span>
                    </motion.a>
                  )}
                  {megaLinks.tidal && (
                    <motion.a
                      href={megaLinks.tidal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.dspLink}
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: { duration: 0.3 }
                        }
                      }}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={styles.dspLinkContent}>
                        <PlatformIcon platform="tidal" size={28} />
                        <span className={styles.dspLinkLabel}>Tidal</span>
                      </div>
                      <span className={styles.dspLinkArrow}>→</span>
                    </motion.a>
                  )}
                </motion.div>
              ) : (
                <div className={styles.message}>No megaplaylist links yet.</div>
              )}
            </ModalBody>
          </ModalSurface>
        </ModalRoot>
      )}
    </div>
  );
};

export default PerfectSundaysPage;
