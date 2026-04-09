import { forwardRef, useEffect, useRef } from 'react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
}

export const SquareCheckbox = forwardRef<HTMLInputElement, Props>(
  ({ indeterminate = false, className = '', ...rest }, ref) => {
    const defaultRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || defaultRef;

    useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = indeterminate;
      }
    }, [resolvedRef, indeterminate]);

    return (
      <input
        type="checkbox"
        ref={resolvedRef}
        className={`h-4 w-4 rounded shrink-0 border-slate-300 text-[#307c4c] focus:ring-[#307c4c] transition-all cursor-pointer ${className}`}
        {...rest}
      />
    );
  }
);

SquareCheckbox.displayName = 'SquareCheckbox';
