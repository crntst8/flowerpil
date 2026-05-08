/**
 * Top10Redirect Component
 *
 * Direct entry point for /top10.
 * Always loads the editor so returning users land on their playlist.
 */

import Top10Editor from './Top10Editor';

const Top10Redirect = () => {
  return <Top10Editor />;
};

export default Top10Redirect;
