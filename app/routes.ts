import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("datasets/:id", "routes/dataset.tsx"),
  route("api/ckan", "routes/api.ckan.ts"),
] satisfies RouteConfig;
