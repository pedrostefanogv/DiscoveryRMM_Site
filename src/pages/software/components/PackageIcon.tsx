import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { buildIconCandidates } from '../softwareStoreUtils';

export function PackageIcon({
  url,
  homepage,
  downloadUrl,
  name,
}: {
  url?: string | null;
  homepage?: string | null;
  downloadUrl?: string | null;
  name?: string | null;
}) {
  const sources = buildIconCandidates(url, homepage, downloadUrl);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [url, homepage, downloadUrl]);

  const currentSource = sources[sourceIndex] ?? null;

  return (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
      {currentSource ? (
        <img
          src={currentSource}
          alt={name ?? 'app icon'}
          width={28}
          height={28}
          className="rounded object-contain"
          onError={() => {
            setSourceIndex((prev) => prev + 1);
          }}
          onLoad={(e) => {
            (e.target as HTMLImageElement).style.display = 'block';
          }}
        />
      ) : null}
      <Package
        className="h-5 w-5 text-slate-500"
        style={{ display: currentSource ? 'none' : undefined }}
      />
    </div>
  );
}
