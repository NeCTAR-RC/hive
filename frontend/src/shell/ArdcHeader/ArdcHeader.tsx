import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
  Heading,
  Link as AriaLink,
} from "react-aria-components";
import { Button, ChevronDown, Close } from "@ardc-ui/react";
import { Menu as MenuIcon } from "lucide-react";
import { DESKTOP, useMediaQuery } from "../../lib/useMediaQuery";
import {
  ARDC_HOME,
  MAIN_ITEMS,
  SERVICE_MENU,
  UTILITY_LINKS,
  type MainItem,
} from "./menu-data";
import styles from "./ArdcHeader.module.scss";

/**
 * The ARDC site header: logo and utility band, then the navigation row with
 * the mega menu and the service menu (Figma header spec). Below 1024px it
 * collapses to the logo and a menu button opening a drawer.
 */
export function ArdcHeader() {
  const isDesktop = useMediaQuery(DESKTOP);
  return (
    <header className={styles.header}>
      <div className={styles.band}>
        <div className={styles.container}>
          <a className={styles.logo} href={ARDC_HOME}>
            <img
              src="/ardc-logo.svg"
              alt="ARDC, Australian Research Data Commons"
            />
          </a>
          {isDesktop ? (
            <nav aria-label="ARDC" className={styles.utility}>
              <ul>
                {UTILITY_LINKS.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <MobileMenu />
          )}
        </div>
      </div>
      {isDesktop && (
        <div className={styles.navRow}>
          <div className={styles.container}>
            <nav aria-label="ARDC website" className={styles.main}>
              <ul>
                {MAIN_ITEMS.map((item) =>
                  item.sections ? (
                    <MegaMenuItem key={item.label} item={item} />
                  ) : (
                    <li key={item.label}>
                      <a className={styles.mainLink} href={item.href}>
                        {item.label}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </nav>
            <ServiceMenu />
          </div>
        </div>
      )}
    </header>
  );
}

function MegaMenuItem({ item }: { item: MainItem }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <li ref={ref} className={styles.megaItem}>
      <button
        type="button"
        className={styles.mainLink}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <ChevronDown aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className={styles.megaPanel}
        hidden={!open}
        onBlur={(event) => {
          if (!ref.current?.contains(event.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
      >
        <div className={styles.container}>
          {item.sections?.map((section) => (
            <div key={section.label} className={styles.megaSection}>
              <h2 className={styles.megaHeading}>
                {section.href ? (
                  <a href={section.href}>{section.label}</a>
                ) : (
                  section.label
                )}
              </h2>
              <ul>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}

function ServiceMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={styles.serviceMenu}>
      <button
        type="button"
        className={styles.serviceButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Nectar services
        <ChevronDown aria-hidden="true" />
      </button>
      <ul id={panelId} className={styles.serviceList} hidden={!open}>
        {SERVICE_MENU.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="link"
        size="sm"
        aria-expanded={open}
        onPress={() => setOpen(true)}
        className={styles.mobileButton}
      >
        <MenuIcon aria-hidden="true" size={20} />
        ARDC menu
      </Button>
      <ModalOverlay
        isOpen={open}
        onOpenChange={setOpen}
        isDismissable
        className={styles.overlay}
      >
        <AriaModal className={styles.drawer}>
          <AriaDialog className={styles.drawerDialog}>
            {({ close }) => (
              <>
                <div className={styles.drawerHead}>
                  <Heading slot="title" className={styles.drawerTitle}>
                    ARDC
                  </Heading>
                  <Button variant="link" size="sm" onPress={close}>
                    <Close aria-hidden="true" />
                    Close
                  </Button>
                </div>
                <nav aria-label="ARDC website">
                  <ul className={styles.drawerList}>
                    {MAIN_ITEMS.map((item) => (
                      <li key={item.label}>
                        {item.href ? (
                          <AriaLink href={item.href}>{item.label}</AriaLink>
                        ) : (
                          <span className={styles.drawerGroup}>
                            {item.label}
                          </span>
                        )}
                        {item.sections && (
                          <ul>
                            {item.sections.map((section) => (
                              <li key={section.label}>
                                <AriaLink href={section.href ?? ARDC_HOME}>
                                  {section.label}
                                </AriaLink>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                    <li>
                      <span className={styles.drawerGroup}>
                        Nectar services
                      </span>
                      <ul>
                        {SERVICE_MENU.map((link) => (
                          <li key={link.href}>
                            <AriaLink href={link.href}>{link.label}</AriaLink>
                          </li>
                        ))}
                      </ul>
                    </li>
                    {UTILITY_LINKS.map((link) => (
                      <li key={link.href}>
                        <AriaLink href={link.href}>{link.label}</AriaLink>
                      </li>
                    ))}
                  </ul>
                </nav>
              </>
            )}
          </AriaDialog>
        </AriaModal>
      </ModalOverlay>
    </>
  );
}
