import { Component, type ReactNode } from 'react';

type Props = { assetKey: string; children: ReactNode; fallback?: ReactNode; onError?: () => void };
type State = { failed: boolean };

export class PetSceneBoundary extends Component<Props, State> {
  state = { failed: false };
  componentDidUpdate(previous: Props, previousState: State) {
    if (previousState.failed && previous.assetKey !== this.props.assetKey) this.setState({ failed: false });
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children; }
}
