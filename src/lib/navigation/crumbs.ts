export type Crumb = { label: string; href?: string };

export type ProjectCrumbInput = {
  projectName: string;
  projectSlug: string;
  pageName?: string;
  pageId?: string;
  comparisonName?: string;
};

/**
 * Builds the Projects → project → page → comparison trail.
 *
 * The deepest crumb is always the page the user is already on, so it comes
 * back without an href and renders as plain text rather than a link.
 */
export function buildProjectCrumbs({
  projectName,
  projectSlug,
  pageName,
  pageId,
  comparisonName,
}: ProjectCrumbInput): Crumb[] {
  const crumbs: Crumb[] = [
    { label: "Projects", href: "/projects" },
    { label: projectName, href: `/projects/${projectSlug}` },
  ];

  if (pageName && pageId) {
    crumbs.push({ label: pageName, href: `/projects/${projectSlug}/${pageId}` });

    if (comparisonName) {
      crumbs.push({ label: comparisonName });
    }
  }

  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb
  );
}
