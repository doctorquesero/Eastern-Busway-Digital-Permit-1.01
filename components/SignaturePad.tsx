import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, Type, PenTool } from 'lucide-react';
import { Signature, SignatureType } from '../types';

interface SignaturePadProps {
  label: string;
  onSave: (sig: Signature) => void;
  initialValue?: Signature;
  externalName?: string; // New prop to sync name from external inputs
}

const SignaturePad: React.FC<SignaturePadProps> = ({ label, onSave, initialValue, externalName }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<SignatureType>('draw');
  const [signerName, setSignerName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (initialValue) {
        setMode(initialValue.type);
        setSignerName(initialValue.name);
        setHasSignature(true);
    }
  }, [initialValue]);

  // Sync with external name if provided and not yet signed
  useEffect(() => {
    if (externalName !== undefined && !hasSignature) {
      setSignerName(externalName);
    }
  }, [externalName, hasSignature]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
         clientX = e.touches[0].clientX;
         clientY = e.touches[0].clientY;
    } else {
         clientX = (e as React.MouseEvent).clientX;
         clientY = (e as React.MouseEvent).clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw' || hasSignature) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const coords = getCoords(e);

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw' || hasSignature) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const coords = getCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
  };

  const handleSave = () => {
    if (!signerName.trim()) {
        alert("Please enter your name.");
        return;
    }

    if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (canvas) {
            const dataUrl = canvas.toDataURL();
            onSave({
                type: 'draw',
                data: dataUrl,
                name: signerName,
                date: new Date().toISOString()
            });
            setHasSignature(true);
        }
    } else {
        onSave({
            type: 'type',
            data: signerName,
            name: signerName,
            date: new Date().toISOString()
        });
        setHasSignature(true);
    }
  };

  // High contrast white background for inputs
  const inputClass = "w-full bg-white text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow font-medium";

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-bold text-gray-700">{label}</label>
        {!hasSignature && (
            <div className="flex space-x-2">
            <button
                type="button"
                onClick={() => setMode('draw')}
                className={`p-1 rounded ${mode === 'draw' ? 'bg-brand-100 text-brand-700' : 'text-gray-500'}`}
                title="Draw Signature"
            >
                <PenTool size={16} />
            </button>
            <button
                type="button"
                onClick={() => setMode('type')}
                className={`p-1 rounded ${mode === 'type' ? 'bg-brand-100 text-brand-700' : 'text-gray-500'}`}
                title="Type Signature"
            >
                <Type size={16} />
            </button>
            </div>
        )}
      </div>

      {hasSignature ? (
          <div className="p-4 bg-green-50 border border-green-100 rounded text-center">
              <Check className="mx-auto text-green-600 mb-2" size={24} />
              <p className="text-green-800 font-bold">Signed by: {signerName}</p>
              <p className="text-xs text-green-600">{new Date().toLocaleString()}</p>
              {mode === 'type' ? (
                  <p className="text-lg font-script mt-2 italic">{signerName}</p>
              ) : (
                  <img src={initialValue?.data || ''} alt="Signature" className="h-16 mx-auto mt-2" />
              )}
              <button onClick={() => { setHasSignature(false); clear(); }} className="mt-2 text-xs text-red-500 font-bold underline no-print">Clear / Re-sign</button>
          </div>
      ) : (
          <>
             <div className="mb-3">
                 <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Enter Full Name (Required)"
                    className={inputClass}
                />
             </div>

            {mode === 'draw' ? (
                <canvas
                ref={canvasRef}
                width={300}
                height={150}
                className="border border-gray-300 rounded w-full touch-none bg-white cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                />
            ) : (
                <div className="p-8 text-center bg-white border border-dashed border-gray-300 rounded text-gray-400 italic">
                    Type your name above to sign
                </div>
            )}

            <div className="flex justify-end space-x-2 mt-2">
                <button
                type="button"
                onClick={clear}
                className="px-3 py-1 text-xs text-gray-600 font-bold hover:text-red-600 flex items-center"
                >
                <Eraser size={12} className="mr-1" /> Clear
                </button>
                <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1 text-sm bg-brand-600 text-white font-bold rounded hover:bg-brand-700 shadow-sm transition-colors"
                >
                Confirm Signature
                </button>
            </div>
          </>
      )}
    </div>
  );
};

export default SignaturePad;