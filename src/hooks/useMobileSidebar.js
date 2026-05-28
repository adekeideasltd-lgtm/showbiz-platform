import { useState, useEffect } from 'react';

export default function useMobileSidebar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, []);

  return { open, setOpen };
}
