import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { OAuthCallback } from './components/Auth/OAuthCallback';
import { Library } from './components/Library/Library';
import { Viewer } from './components/Viewer/Viewer';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/viewer" element={<Viewer />} />
          <Route path="/oauth/callback/:provider" element={<OAuthCallback />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
