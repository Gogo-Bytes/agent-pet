import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import styles from './IconButton.module.css';

export const IconButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(function IconButton({ className = '', type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={`${styles.button} ${className}`} {...props} />;
});
