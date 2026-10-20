// Links to other Nectar sites, shared by the dashboard bar and the home page.

export interface MenuLink {
  label: string;
  href: string;
}

/** The "service menu" dropdown: other Nectar services, as in Horizon's header. */
export const SERVICE_MENU: MenuLink[] = [
  {
    label: "Virtual Desktop Service",
    href: "https://desktop.rc.nectar.org.au/",
  },
  {
    label: "Jupyter Notebook Service",
    href: "https://jupyterhub.rc.nectar.org.au/",
  },
  { label: "BinderHub Service", href: "https://binderhub.rc.nectar.org.au/" },
];

export const SUPPORT_LINKS = {
  tutorials: "https://tutorials.rc.nectar.org.au/",
  supportCentre: "https://support.ehelp.edu.au/",
  status: "https://status.rc.nectar.org.au/",
};
