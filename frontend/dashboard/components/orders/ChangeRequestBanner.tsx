import Button from "../ui/button/Button";

interface ChangeRequestBannerProps {
  onApprove: () => void;
  onDeny: () => void;
}

export function ChangeRequestBanner({ onApprove, onDeny }: ChangeRequestBannerProps) {
  return (
    <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
            Prośba o zmiany
          </div>
          <div className="text-xs text-warning-600 dark:text-warning-400">
            Klient prosi o możliwość modyfikacji wyboru. Zatwierdź, aby odblokować wybór, lub
            odrzuć, aby przywrócić poprzedni status.
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onApprove}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Zatwierdź
          </Button>
          <Button size="sm" variant="outline" onClick={onDeny}>
            Odrzuć
          </Button>
        </div>
      </div>
    </div>
  );
}
