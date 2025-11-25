import { useEffect, useState } from "react";
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
  duration = 2000,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in animation
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 10);

    // Auto-dismiss after duration
    if (duration > 0) {
      const dismissTimer = setTimeout(() => {
        setIsVisible(false);
        // Wait for slide-out animation before removing
        setTimeout(() => {
          onClose();
        }, 300);
      }, duration);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(dismissTimer);
      };
    }

    return () => clearTimeout(showTimer);
  }, [duration, onClose]);

  return (
    <div
      className={`max-w-md w-full transform transition-all duration-300 ease-out shadow-2xl ${
        isVisible
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      }`}
      style={{ 
        willChange: 'transform, opacity',
        position: 'relative',
        minWidth: '320px',
        minHeight: '80px',
      }}
    >
      <Alert variant={variant} title={title} message={message} />
    </div>
  );
};

export default Toast;

