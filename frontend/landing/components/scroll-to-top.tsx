"use client";

import { useEffect, useState } from 'react';
import { PostHogActions } from "@photocloud/posthog-types";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
    // TODO: Track scroll to top click when PostHog is installed
    // posthog.capture(PostHogActions.landing.scrollToTopClick);
  };

  return (
    <>
      {isVisible && (
        <a
          href="#"
          className="scroll-top btn-hover"
          onClick={(e) => {
            e.preventDefault();
            scrollToTop();
          }}
          data-ph-action={PostHogActions.landing.scrollToTopClick}
        >
          <i className="lni lni-chevron-up"></i>
        </a>
      )}
    </>
  );
}

