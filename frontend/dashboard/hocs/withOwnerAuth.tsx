import { useRouter } from "next/router";
import { useEffect, useState, ComponentType } from "react";

import { initAuth, getIdToken, redirectToCognito } from "../lib/auth";

interface WithOwnerAuthProps {
  token: string;
  ownerId: string;
  galleryId: string | string[] | undefined;
  mode: "owner";
}

export default function withOwnerAuth<P extends object>(
  WrappedComponent: ComponentType<P & WithOwnerAuthProps>
) {
  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const { id } = router.query;
    const [token, setToken] = useState<string>("");
    const [ownerId, setOwnerId] = useState<string>("");
    const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

    useEffect(() => {
      if (!id) {
        return;
      }

      // Initialize auth and get Cognito token
      const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

      if (!userPoolId || !clientId) {
        // Redirect directly to Cognito (not via landing)
        void redirectToCognito(router.asPath);
        return;
      }

      initAuth(userPoolId, clientId);

      void getIdToken()
        .then((cognitoToken) => {
          // Decode token to get owner ID
          try {
            const payload = JSON.parse(atob(cognitoToken.split(".")[1])) as {
              sub?: string;
              "cognito:username"?: string;
            };
            setToken(cognitoToken);
            setOwnerId(payload.sub ?? payload["cognito:username"] ?? "");
            setCheckingAuth(false);
          } catch (_e) {
            // Redirect directly to Cognito (not via landing)
            void redirectToCognito(router.asPath);
          }
        })
        .catch(() => {
          // No valid session, check localStorage for manual token
          const stored = localStorage.getItem("idToken");
          if (stored) {
            try {
              const payload = JSON.parse(atob(stored.split(".")[1])) as {
                sub?: string;
                "cognito:username"?: string;
              };
              setToken(stored);
              setOwnerId(payload.sub ?? payload["cognito:username"] ?? "");
              setCheckingAuth(false);
            } catch (_e) {
              // Redirect directly to Cognito (not via landing)
              void redirectToCognito(router.asPath);
            }
          } else {
            // Redirect directly to Cognito (not via landing)
            void redirectToCognito(router.asPath);
          }
        });
    }, [id, router]);

    if (checkingAuth) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div>Loading...</div>
        </div>
      );
    }

    return (
      <WrappedComponent {...props} token={token} ownerId={ownerId} galleryId={id} mode="owner" />
    );
  };
}
