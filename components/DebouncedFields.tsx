import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toDateInputValue } from '../utils/dateUtils';

// Fields with uncommitted text register here so any tap/click anywhere commits them before a Save handler runs.
const pendingFlushers = new Set<() => void>();
export const flushPendingFields = () => { Array.from(pendingFlushers).forEach(fn => fn()); };

if (typeof document !== 'undefined') {
    ['pointerdown', 'touchstart', 'mousedown'].forEach(evt => document.addEventListener(evt, flushPendingFields, true));
}

type CommitProps = {
    value: string;
    onValueChange: (value: string) => void;
    debounceMs?: number;
};

// Keeps keystrokes in local state and pushes to the parent on blur, after a pause, or on unmount.
function useDebouncedValue({ value, onValueChange, debounceMs = 300 }: CommitProps) {
    const [local, setLocal] = useState(value);
    const dirty = useRef(false);
    const latest = useRef(value);
    const commitRef = useRef(onValueChange);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    commitRef.current = onValueChange;

    useEffect(() => {
        if (!dirty.current) {
            setLocal(value);
            latest.current = value;
        }
    }, [value]);

    const flush = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        if (dirty.current) {
            dirty.current = false;
            commitRef.current(latest.current);
        }
    }, []);

    // Immediate commit function for synchronous updates
    const commitImmediately = useCallback(() => {
        if (dirty.current) {
            dirty.current = false;
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            commitRef.current(latest.current);
        }
    }, []);

    useEffect(() => {
        pendingFlushers.add(flush);
        return () => {
            pendingFlushers.delete(flush);
            flush();
        };
    }, [flush]);

    const change = (next: string) => {
        dirty.current = true;
        latest.current = next;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, debounceMs);
    };

    return { local, change, flush, commitImmediately };
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & CommitProps;

export const DebouncedInput: React.FC<InputProps> = ({ value, onValueChange, debounceMs, onBlur, ...rest }) => {
    const { local, change, commitImmediately } = useDebouncedValue({ value: value ?? '', onValueChange, debounceMs });
    return (
        <input
            {...rest}
            value={local}
            onChange={e => change(e.target.value)}
            onBlur={e => { commitImmediately(); onBlur?.(e); }}
        />
    );
};

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & CommitProps;

export const DebouncedTextArea: React.FC<TextAreaProps> = ({ value, onValueChange, debounceMs, onBlur, ...rest }) => {
    const { local, change, commitImmediately } = useDebouncedValue({ value: value ?? '', onValueChange, debounceMs });
    return (
        <textarea
            {...rest}
            value={local}
            onChange={e => change(e.target.value)}
            onBlur={e => { commitImmediately(); onBlur?.(e); }}
        />
    );
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
    value: string;
    onValueChange: (value: string) => void;
};

// No debounce: updates the DOM immediately and re-commits on blur to catch the iOS picker "Done" action.
function useImmediateValue(value: string, onValueChange: (value: string) => void) {
    const [local, setLocal] = useState(value);
    const committed = useRef(value);
    useEffect(() => {
        setLocal(value);
        committed.current = value;
    }, [value]);
    const commit = (next: string) => {
        if (next === committed.current) return;
        committed.current = next;
        onValueChange(next);
    };
    return {
        local,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            setLocal(e.target.value);
            commit(e.target.value);
        },
        onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
            setLocal(e.target.value);
            commit(e.target.value);
        },
    };
}

export const SyncedSelect: React.FC<SelectProps> = ({ value, onValueChange, onBlur, children, ...rest }) => {
    const f = useImmediateValue(value ?? '', onValueChange);
    return (
        <select {...rest} value={f.local} onChange={f.onChange} onBlur={e => { f.onBlur(e); onBlur?.(e); }}>
            {children}
        </select>
    );
};

export const SyncedDateInput: React.FC<InputProps> = ({ value, onValueChange, debounceMs, onBlur, ...rest }) => {
    const f = useImmediateValue(value ?? '', onValueChange);
    return (
        <input {...rest} type="date" value={f.local} onChange={f.onChange} onBlur={e => { f.onBlur(e); onBlur?.(e); }} />
    );
};
