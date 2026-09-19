/** Shared navigation for viewer / AR / print — keeps ?job= and ?back= in the URL for phones. */

export function viewerNavState(locationState, backTo = "/projects") {
  return {
    ...(locationState ?? {}),
    backTo: locationState?.backTo ?? backTo,
    jobId: locationState?.jobId ?? null,
  };
}

function buildViewerSearch(location, overrides = {}) {
  const params = new URLSearchParams(location.search);
  const state = location.state ?? {};
  const jobId = overrides.jobId ?? state.jobId ?? params.get("job");
  const backTo = overrides.backTo ?? state.backTo ?? params.get("back") ?? "/projects";

  if (jobId) params.set("job", jobId);
  params.set("back", backTo);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function goToViewerTab(navigate, location, path) {
  const search = buildViewerSearch(location);
  const state = viewerNavState(location.state);
  navigate(`${path}${search}`, {
    replace: true,
    state,
  });
}

export function backFromViewerTab(navigate, location) {
  const search = buildViewerSearch(location);
  navigate(`/viewer${search}`, {
    replace: true,
    state: viewerNavState(location.state),
  });
}

export function backToProjects(navigate, location) {
  const params = new URLSearchParams(location.search);
  const backTo = location.state?.backTo ?? params.get("back") ?? "/projects";
  navigate(backTo, { replace: true });
}
