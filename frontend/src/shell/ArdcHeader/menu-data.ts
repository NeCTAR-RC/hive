// Content for the ARDC site header (utility links, main navigation with the
// mega menu, and the service menu). The structure follows the Figma header
// spec; the labels and targets below are placeholders to be supplied by
// ARDC communications before launch.

export interface MenuLink {
  label: string;
  href: string;
  description?: string;
}

export interface MenuSection {
  label: string;
  href?: string;
  links: MenuLink[];
}

export interface MainItem {
  label: string;
  href?: string;
  sections?: MenuSection[];
}

export const ARDC_HOME = "https://ardc.edu.au/";

export const UTILITY_LINKS: MenuLink[] = [
  { label: "Contact", href: "https://ardc.edu.au/contact-us/" },
  { label: "Subscribe", href: "https://ardc.edu.au/subscribe/" },
];

export const MAIN_ITEMS: MainItem[] = [
  { label: "About", href: "https://ardc.edu.au/about-us/" },
  {
    label: "Services",
    sections: [
      {
        label: "Cloud Computing",
        href: "https://ardc.edu.au/services/ardc-nectar-research-cloud/",
        links: [
          {
            label: "ARDC Nectar Research Cloud",
            href: "https://ardc.edu.au/services/ardc-nectar-research-cloud/",
          },
          {
            label: "Virtual Desktop Service",
            href: "https://desktop.rc.nectar.org.au/",
          },
          {
            label: "Jupyter Notebook Service",
            href: "https://jupyterhub.rc.nectar.org.au/",
          },
          {
            label: "BinderHub Service",
            href: "https://binderhub.rc.nectar.org.au/",
          },
        ],
      },
      {
        label: "Discovery and Sharing",
        href: "https://ardc.edu.au/services/",
        links: [
          {
            label: "Research Data Australia",
            href: "https://researchdata.edu.au/",
          },
        ],
      },
      {
        label: "Identifier Services",
        href: "https://ardc.edu.au/services/",
        links: [
          {
            label: "ARDC Identifier Services",
            href: "https://ardc.edu.au/services/ardc-identifier-services/",
          },
        ],
      },
      {
        label: "Tools and Training",
        href: "https://ardc.edu.au/services/",
        links: [
          {
            label: "Nectar Tutorials",
            href: "https://tutorials.rc.nectar.org.au/",
          },
        ],
      },
    ],
  },
  { label: "Resource Hub", href: "https://ardc.edu.au/resource-hub/" },
  {
    label: "News and Events",
    href: "https://ardc.edu.au/news-and-events/",
  },
];

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
