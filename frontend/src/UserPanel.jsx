import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "./api";
import "./Auth.css";

export default function UserPanel() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await authFetch("/auth/me");

        if (!response.ok) {
          navigate("/login");
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const response = await authFetch("/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        localStorage.removeItem("userKind");
        navigate("/login");
      } else {
        setError("Logout failed");
      }
    } catch {
      setError("Logout failed");
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h1>User Panel</h1>
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="user-info">
        <h2>Welcome, {user?.full_name}!</h2>
        <div className="info-card">
          <p>
            <strong>Email:</strong> {user?.email}
          </p>
          <p>
            <strong>Phone:</strong> {user?.phone_number}
          </p>
          <p>
            <strong>Member since:</strong> {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
          </p>
        </div>
      </div>

      <div className="panel-section">
        <h3>Your Documents</h3>
        <p>Access your uploaded documents and processing history.</p>
        <button className="btn-primary" onClick={() => navigate("/documents")}>
          Go to Documents
        </button>
      </div>

      <div className="panel-section">
        <h3>Voice Transcription</h3>
        <p>Record and transcribe audio, and format it automatically.</p>
        <button className="btn-primary" onClick={() => navigate("/voice")}>
          Go to Voice
        </button>
      </div>
    </div>
  );
}
