import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './screens/Landing';
import TripSetup from './screens/TripSetup';
import Room from './screens/Room';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<TripSetup />} />
        <Route path="/r/:code" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
