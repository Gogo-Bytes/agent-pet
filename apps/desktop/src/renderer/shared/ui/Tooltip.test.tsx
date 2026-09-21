// @vitest-environment jsdom
import '../../test-support/dom-platform.js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip.js';
import { IconButton } from './IconButton.js';
import { baselineLayout } from '../../test-support/pi-fixtures.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('portals only inside the authoritative pet region; keyboard focus describes the button, Escape dismisses without stealing focus', async () => {
  const user = userEvent.setup();
  const rect = baselineLayout('top-left', 80).pet;
  const view = render(<Tooltip label="调整大小（方向键）" rect={rect}><IconButton aria-label="调整大小">size</IconButton></Tooltip>);
  await user.tab();
  const button = screen.getByRole('button');
  const tooltip = screen.getByRole('tooltip');
  expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
  const region = tooltip.closest<HTMLElement>('[data-tooltip-region="pet"]')!;
  expect(region.parentElement).toBe(document.body);
  expect(region.style.width).toBe('80px');
  expect(region.style.left).toBe(`${rect.x}px`);
  expect(view.container.contains(tooltip)).toBe(false);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(document.activeElement).toBe(button);
  await user.tab();
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('opens on delayed pointer hover, closes on leave/click, preserves normal clicks, and disabled buttons do not expose tooltips', async () => {
  const user = userEvent.setup();
  const click = vi.fn();
  const rect = baselineLayout().pet;
  const view = render(<Tooltip label="隐藏气泡" rect={rect}><IconButton onClick={click}>toggle</IconButton></Tooltip>);
  await user.hover(screen.getByRole('button'));
  expect(screen.queryByRole('tooltip')).toBeNull();
  await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy());
  await user.unhover(screen.getByRole('button'));
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('tooltip')).toBeNull();
  view.rerender(<Tooltip label="不可用" rect={rect} disabled><IconButton disabled onClick={click}>toggle</IconButton></Tooltip>);
  await user.hover(screen.getByRole('button'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledTimes(1);
});
