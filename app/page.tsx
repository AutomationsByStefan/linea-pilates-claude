import './globals.css';
import App from '@/components/App';
import PinGate from '@/components/PinGate';

export default function Page() {
  return (
    <PinGate>
      <App />
    </PinGate>
  );
}
