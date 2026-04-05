import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

export function useAuthGuard() {
  const { status } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated" || status === "error") {
      navigate("/");
    }
  }, [status, navigate]);
}
