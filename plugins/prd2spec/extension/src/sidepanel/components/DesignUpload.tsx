import { useState, useRef, useEffect } from 'react';

interface UploadedImage {
  id: string;
  dataUrl: string;
  timestamp: number;
}

interface DesignUploadProps {
  onImagesChange: (images: UploadedImage[]) => void;
}

export function DesignUpload({ onImagesChange }: DesignUploadProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onImagesChange(images);
  }, [images, onImagesChange]);

  const addImage = (dataUrl: string) => {
    const newImage: UploadedImage = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dataUrl,
      timestamp: Date.now(),
    };
    setImages((prev) => [...prev, newImage]);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (evt.target?.result) {
              addImage(evt.target.result as string);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          addImage(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          addImage(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  useEffect(() => {
    const area = pasteAreaRef.current;
    if (!area) return;

    area.addEventListener('paste', handlePaste as any);
    return () => area.removeEventListener('paste', handlePaste as any);
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={pasteAreaRef}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        tabIndex={0}
        className={`border-2 border-dashed rounded p-4 text-center transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50'
        }`}
      >
        <div className="text-xs text-gray-600 mb-2">
          点击此区域，然后按 <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Ctrl+V</kbd> 粘贴截图
        </div>
        <div className="text-[11px] text-gray-400 mb-2">或拖拽图片到此处</div>
        <label className="inline-block text-xs px-3 py-1.5 bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-100">
          选择文件
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      {images.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">
            已添加 {images.length} 张图片
          </div>
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="relative group border border-gray-200 rounded overflow-hidden bg-white"
              >
                <img
                  src={img.dataUrl}
                  alt="设计稿"
                  className="w-full h-32 object-contain"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
