import { useEffect } from "react";
import Alert from "../alert/Alert";

interface ToastProps {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({
  variant,
  title,
  message,
  onClose,
  duration = 5000,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div className="animate-slide-in max-w-md">
      <Alert variant={variant} title={title} message={message} />
    </div>
  );
};

export default Toast;

