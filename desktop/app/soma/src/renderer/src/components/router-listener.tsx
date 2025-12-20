import {useLocation} from "react-router";
import {useEffect} from "react";

function RouterListener() {
  const location = useLocation();

  useEffect(() => {
    console.log('Location changed');
  }, [location]);

  useEffect(() => {
    if (location.pathname === "/") return;
    const next = `${location.pathname}${location.search}`;
    window.api.setLastRoute(next);
  }, [location.pathname, location.search]);

  return null;
}

export { RouterListener }
