// @ts-nocheck
import { useEffect, useRef, useState } from 'react';

import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const getDayliMotionAPI = (videoId: string) =>
  `https://api.dailymotion.com/video/${videoId}?fields=thumbnail_url`;

const DailyMotion = ({ videoId, attributes, children, ...other }) => {
  const dailyMotionRootRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [isFrameLoaded, setFrameLoaded] = useState(false);

  const { isIntersecting: isInViewport } = useIntersectionObserver(dailyMotionRootRef, {
    freezeOnceVisible: true,
    rootMargin: '50%',
  });

  useEffect(() => {
    fetch(getDayliMotionAPI(videoId))
      .then((data) => data.json())
      .then((data) => setSrc(data.thumbnail_url))
      .catch(() => setSrc(null));
  }, [videoId]);

  const onRef = (el) => {
    dailyMotionRootRef.current = el;
    attributes.ref(el);
  };

  return (
    <div {...attributes} ref={onRef} className="relative">
      <img
        src={src || ''}
        alt="daylimotion_video_preview"
        width="100%"
        height="100%"
        className="absolute top-0 left-0 w-full h-full"
        style={{
          opacity: isInViewport && isFrameLoaded ? 0 : 1,
          zIndex: isInViewport && isFrameLoaded ? -1 : 0,
        }}
      />
      {isInViewport && (
        <iframe
          title="Dailymotion Video Player"
          frameBorder={0}
          onLoad={() => setFrameLoaded(true)}
          src={`https://www.dailymotion.com/embed/video/${videoId}`}
          allowFullScreen
          className="absolute top-0 left-0"
          {...other}
        />
      )}
      {children}
    </div>
  );
}

export default DailyMotion;
