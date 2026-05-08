import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const HelpContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: #fff;
  
  iframe {
    width: 100%;
    min-height: 100vh;
    border: none;
  }
`;

export default function QobizHelpPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Small delay to ensure iframe loads
    const timer = setTimeout(() => {
      setLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <HelpContainer>
      {loading && <div>Loading help page...</div>}
      <iframe
        src="/qobiz-help"
        title="Qobiz Help"
        onLoad={() => setLoading(false)}
        style={{ display: loading ? 'none' : 'block' }}
      />
    </HelpContainer>
  );
}

