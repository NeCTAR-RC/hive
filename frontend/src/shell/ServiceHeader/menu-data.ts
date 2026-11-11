/** A labelled destination in the header's menus. */
export interface MenuLink {
  label: string;
  href: string;
}

/**
 * The "Services" dropdown: the other Nectar services (function mirrored from
 * Horizon).
 */
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

/** The account menu's destinations, and the way in without a session. */
export const ACCOUNT_LINKS = {
  myDetails: "/account/my-details",
  openrc: "/api/api-access/openrc",
  login: "/auth/login",
};
