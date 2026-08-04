interface PastedImage {
  id: string;
  dataUrl: string;
}

interface Props {
  images: PastedImage[];
  onRemove: (id: string) => void;
}

export function ChatImageStrip({ images, onRemove }: Props) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-1.5">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group border border-gray-200 rounded overflow-hidden bg-white"
        >
          <img src={img.dataUrl} alt="粘贴图" className="h-12 w-12 object-cover" />
          <button
            type="button"
            onClick={() => onRemove(img.id)}
            className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl opacity-0 group-hover:opacity-100"
            title="移除"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
