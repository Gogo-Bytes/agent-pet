import { useId, type ComponentProps } from 'react';
import './text-field.css';

type Props = ComponentProps<'input'> & { label: string; hint?: string | undefined; error?: string | undefined };
/** Native input semantics, with one label, one focus ring and associated feedback. */
export function TextField({ label, hint, error, id, ...input }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  const descriptionId = `${fieldId}-description`;
  const description = error || hint;
  const describedBy = [input['aria-describedby'], description && descriptionId].filter(Boolean).join(' ') || undefined;
  return <div className="cfg-text-field">
    <div className="cfg-field-label"><label htmlFor={fieldId}>{label}</label>{input.maxLength && typeof input.value === 'string' && <span aria-hidden="true">{input.value.length}/{input.maxLength}</span>}</div>
    <input {...input} id={fieldId} aria-invalid={error ? true : input['aria-invalid']} aria-describedby={describedBy} />
    {description && <p id={descriptionId} className={error ? 'cfg-field-error' : 'cfg-field-hint'} aria-live="polite">{description}</p>}
  </div>;
}
