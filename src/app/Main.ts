/*
  Copyright 2019 Esri

  Licensed under the Apache License, Version 2.0 (the "License");

  you may not use this file except in compliance with the License.

  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software

  distributed under the License is distributed on an "AS IS" BASIS,

  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and

  limitations under the License.​
*/

// dojo.i18n
import * as i18nInteractiveLegend from "dojo/i18n!./nls/resources";

// ApplicationBase.ApplicationBase
import ApplicationBase = require("ApplicationBase/ApplicationBase");

// ApplicationBase.support.itemUtils
import {
  createMapFromItem,
  createView,
  getConfigViewProperties,
  getItemTitle,
  findQuery,
  goToMarker
} from "ApplicationBase/support/itemUtils";

// ApplicationBase.support.domHelper
import {
  setPageLocale,
  setPageDirection,
  setPageTitle
} from "ApplicationBase/support/domHelper";

// esri.views.MapView
import MapView = require("esri/views/MapView");

// esri.widgets.Home
import Home = require("esri/widgets/Home");

// esri.widgets.LayerList
import LayerList = require("esri/widgets/LayerList");

// esri.widgets.Search
import Search = require("esri/widgets/Search");

// esri.layers.FeatureLayer
import FeatureLayer = require("esri/layers/FeatureLayer");

// esri.widgets.BasemapToggle
import BasemapToggle = require("esri/widgets/BasemapToggle");

// esri.widgets.Expand
import Expand = require("esri/widgets/Expand");

// esri.core.watchUtils
import watchUtils = require("esri/core/watchUtils");

// esri.Color
import Color = require("esri/Color");

// Screenshot
import Screenshot = require("./Components/Screenshot/Screenshot");

// Info
import Info = require("./Components/Info/Info");

// Telemetry
import Telemetry = require("telemetry/telemetry.dojo");

// FeatureWidget
import FeatureWidget = require("esri/widgets/Feature");

// InteractiveLegend
import InteractiveLegend = require("./Components/InteractiveLegend/InteractiveLegend");

// CSS
const CSS = {
  loading: "configurable-application--loading",
  legend: "offscreen-interactive-legend-container",
  popup: "offscreen-pop-up-container"
};

class InteractiveLegendApp {
  //--------------------------------------------------------------------------
  //
  //  Properties
  //
  //--------------------------------------------------------------------------

  base: ApplicationBase = null;
  telemetry: Telemetry = null;
  search: Search = null;
  layerList: LayerList = null;
  layerListExpand: Expand = null;
  screenshot: Screenshot = null;
  interactiveLegendExpand: Expand = null;
  searchExpand: Expand = null;
  featureWidget: FeatureWidget = null;
  highlightedFeature: any = null;
  infoExpand: Expand = null;

  //--------------------------------------------------------------------------
  //
  //  Public Methods
  //
  //--------------------------------------------------------------------------

  public init(base: ApplicationBase): void {
    if (!base) {
      console.error("ApplicationBase is not defined");
      return;
    }
    setPageLocale(base.locale);
    setPageDirection(base.direction);
    this.base = base;

    const { config, results, portal } = base;
    const { find, marker } = config;

    // Setup Telemetry
    if (config.telemetry) {
      let options = config.telemetry.prod;
      if (portal.customBaseUrl.indexOf("mapsdevext") !== -1) {
        // use devext credentials
        options = config.telemetry.devext;
      } else if (portal.customBaseUrl.indexOf("mapsqa") !== -1) {
        // or qa
        options = config.telemetry.qaext;
      }
      this.telemetry = new Telemetry({
        portal,
        disabled: options.disabled,
        debug: options.debug,
        amazon: options.amazon
      });
      this.telemetry.logPageView();
    }

    const {
      expandEnabled,
      highlightShade,
      mutedShade,
      style,
      filterMode,
      screenshotEnabled,
      legendIncludedInScreenshot,
      popupIncludedInScreenshot,
      featureCountEnabled,
      layerListEnabled,
      searchEnabled,
      basemapToggleEnabled,
      homeEnabled,
      nextBasemap,
      searchConfig,
      infoPanelEnabled
    } = config;
    const { webMapItems } = results;
    const validWebMapItems = webMapItems.map(response => {
      return response.value;
    });
    const firstItem = validWebMapItems[0];
    if (!firstItem) {
      const error = i18nInteractiveLegend.error;
      document.body.innerText = error;
      document.body.classList.remove("configurable-application--loading");
      document.body.classList.add("error");
      console.error(error);
      this.telemetry.logError({
        error
      });
      return;
    }

    config.title = !config.title
      ? getItemTitle(firstItem)
      : "Interactive Legend";
    setPageTitle(config.title);

    // todo: Typings will be fixed in next release.
    const portalItem: any = this.base.results.applicationItem.value;
    const appProxies =
      portalItem && portalItem.appProxies ? portalItem.appProxies : null;

    const viewContainerNode = document.getElementById("viewContainer");
    const defaultViewProperties = getConfigViewProperties(config);

    validWebMapItems.forEach(item => {
      const viewNode = document.createElement("div");
      viewContainerNode.appendChild(viewNode);

      const container = {
        container: viewNode
      };

      const viewProperties = {
        ...defaultViewProperties,
        ...container
      };

      createMapFromItem({ item, appProxies }).then(map =>
        createView({
          ...viewProperties,
          map
        }).then((view: MapView) =>
          findQuery(find, view).then(() => {
            let defaultShade = null;
            if (!mutedShade) {
              defaultShade = new Color("rgba(169,169,169, 0.5)");
            } else {
              if (typeof mutedShade === "string") {
                defaultShade = new Color(mutedShade);
              } else {
                const { r, g, b, a } = mutedShade;
                defaultShade = new Color(`rgba(${r},${g},${b},${a})`);
              }
            }

            const defaultStyle = style ? style : "classic";
            const defaultMode = filterMode ? filterMode : "featureFilter";

            if (highlightShade) {
              const highlightedShade = new Color(highlightShade);
              const { r, g, b, a } = highlightedShade;
              view.highlightOptions = {
                color: new Color(`rgb(${r},${g},${b})`),
                fillOpacity: a
              };
            } else {
              view.highlightOptions = {
                color: new Color("#000000")
              };
            }

            this._handleHomeWidget(view, homeEnabled);

            this._handleBasemapToggleWidget(
              basemapToggleEnabled,
              view,
              nextBasemap
            );
            this.layerList = new LayerList({
              view
            });
            this._handleLayerListWidget(layerListEnabled, view);

            const layerListViewModel = this.layerList
              ? this.layerList.viewModel
              : null;
            let onboardingPanelEnabled = null;
            if (localStorage.getItem("firstTimeUseApp")) {
              onboardingPanelEnabled = false;
            } else {
              localStorage.setItem("firstTimeUseApp", `${Date.now()}`);
              onboardingPanelEnabled = true;
            }

            const interactiveLegend = new InteractiveLegend({
              view,
              mutedShade: defaultShade,
              style: defaultStyle,
              filterMode: defaultMode,
              featureCountEnabled,
              layerListViewModel,
              onboardingPanelEnabled
            });

            const offScreenInteractiveLegend = new InteractiveLegend({
              view,
              container: document.querySelector(
                ".offscreen-interactive-legend-container"
              ),
              mutedShade: defaultShade,
              style: defaultStyle,
              filterMode: defaultMode,
              featureCountEnabled,
              layerListViewModel,
              offscreen: true
            });

            offScreenInteractiveLegend.style.selectedStyleData =
              interactiveLegend.style.selectedStyleData;

            this._handleSearchWidget(
              searchEnabled,
              interactiveLegend,
              view,
              searchConfig
            );

            this.interactiveLegendExpand = new Expand({
              view,
              group: "left",
              content: interactiveLegend,
              mode: "floating",
              expanded: true,
              expandTooltip: interactiveLegend.label
            });

            this._handleScreenshotWidget(
              screenshotEnabled,
              legendIncludedInScreenshot,
              popupIncludedInScreenshot,
              view
            );

            watchUtils.whenOnce(
              this.interactiveLegendExpand,
              "container",
              () => {
                if (this.interactiveLegendExpand.container) {
                  const container = this.interactiveLegendExpand
                    .container as HTMLElement;
                  container.classList.add("expand-content-z-index");
                }
              }
            );
            view.ui.add(this.interactiveLegendExpand, "bottom-left");

            if (infoPanelEnabled) {
              const screenshotTitle =
                i18nInteractiveLegend.onboardingPanelScreenshotTitle;
              const {
                onboardingPanelScreenshotStepOne,
                onboardingPanelScreenshotStepTwo,
                onboardingPanelScreenshotStepThree,
                onboardingPanelScreenshotStepFour,
                onboardingPanelScreenshotStepFive,
                newInteractiveLegend,
                firstOnboardingWelcomeMessage,
                secondOnboardingWelcomeMessage,
                thirdOnboardingWelcomeMessage
              } = i18nInteractiveLegend;
              const screenshotSteps = [
                onboardingPanelScreenshotStepOne,
                onboardingPanelScreenshotStepTwo,
                onboardingPanelScreenshotStepThree,
                onboardingPanelScreenshotStepFour,
                onboardingPanelScreenshotStepFive
              ];
              const infoWidget = new Info({
                infoContent: [
                  {
                    type: "list",
                    title: screenshotTitle,
                    infoContentItems: screenshotSteps
                  },
                  {
                    type: "explanation",
                    title: newInteractiveLegend,
                    infoContentItems: [
                      firstOnboardingWelcomeMessage,
                      secondOnboardingWelcomeMessage,
                      thirdOnboardingWelcomeMessage
                    ]
                  }
                ]
              });

              this.infoExpand = new Expand({
                view,
                group: "left",
                content: infoWidget,
                mode: "floating",
                expandTooltip: infoWidget.label
              });

              infoWidget.expandWidget = this.infoExpand;

              watchUtils.whenOnce(this.infoExpand, "container", () => {
                if (this.infoExpand.container) {
                  const container = this.infoExpand.container as HTMLElement;
                  container.classList.add("expand-content-z-index");
                }
              });

              view.ui.add(this.infoExpand, "top-left");
            }

            goToMarker(marker, view);
            this._addTitle(config.title);

            document.body.classList.remove(CSS.loading);
          })
        )
      );
    });
  }

  // _addTitle
  private _addTitle(appTitle: string): void {
    const appTitleNode = document.createElement("h1");
    const titleContainerNode = document.querySelector(".title-container");
    appTitleNode.classList.add("app-title");
    appTitleNode.innerText = appTitle;
    titleContainerNode.appendChild(appTitleNode);
  }

  // _handleHomeWidget
  private _handleHomeWidget(view: MapView, homeEnabled: boolean): void {
    if (homeEnabled) {
      const home = new Home({
        view
      });
      view.ui.add(home, "top-left");
    }
  }

  // _handleScreenshotWidget
  private _handleScreenshotWidget(
    screenshotEnabled: boolean,
    legendIncludedInScreenshot: boolean,
    popupIncludedInScreenshot: boolean,
    view: MapView
  ): void {
    if (screenshotEnabled) {
      const mapComponentSelectors = [`.${CSS.legend}`, `.${CSS.popup}`];

      this.screenshot = new Screenshot({
        view,
        mapComponentSelectors,
        legendIncludedInScreenshot,
        popupIncludedInScreenshot
      });
      const screenshotExpand = new Expand({
        view,
        group: "left",
        content: this.screenshot,
        mode: "floating",
        expandTooltip: this.screenshot.label
      });

      this.screenshot.expandWidget = screenshotExpand;

      watchUtils.watch(view, "popup.visible", () => {
        if (view.popup.visible) {
          if (!this.featureWidget) {
            this.featureWidget = new FeatureWidget({
              view,
              graphic: view.popup.selectedFeature,
              container: document.querySelector(
                ".offscreen-pop-up-container"
              ) as HTMLElement
            });
            this.screenshot.featureWidget = this.featureWidget;
          } else {
            this.featureWidget.graphic = view.popup.selectedFeature;
          }
        }
      });

      // watchUtils.watch(
      //   this.screenshot.viewModel,
      //   "screenshotModeIsActive",
      //   () => {
      //     if (this.screenshot.viewModel.screenshotModeIsActive) {
      //       this.interactiveLegendExpand.expanded = false;
      //       view.popup.visible = false;

      //       if (this.layerListExpand) {
      //         this.layerListExpand.expanded = false;
      //       }
      //       if (this.searchExpand) {
      //         this.searchExpand.expanded = false;
      //       }

      //       if (this.infoExpand) {
      //         this.infoExpand.expanded = false;
      //       }
      //     } else {
      //       this.interactiveLegendExpand.expanded = true;

      //       if (this.layerListExpand) {
      //         this.layerListExpand.expanded = true;
      //       }
      //       if (this.searchExpand) {
      //         this.searchExpand.expanded = true;
      //       }
      //     }
      //   }
      // );
      watchUtils.watch(view, "popup.visible", () => {
        if (
          !view.popup.visible &&
          this.screenshot.viewModel.screenshotModeIsActive &&
          popupIncludedInScreenshot &&
          view.popup.selectedFeature
        ) {
          const layerView = view.layerViews.find(
            layerView =>
              layerView.layer.id === view.popup.selectedFeature.layer.id
          ) as __esri.FeatureLayerView;
          this.highlightedFeature = layerView.highlight(
            view.popup.selectedFeature
          );
        }
      });

      watchUtils.watch(
        this.screenshot,
        "viewModel.screenshotModeIsActive",
        () => {
          if (!this.screenshot.viewModel.screenshotModeIsActive) {
            if (this.featureWidget) {
              this.featureWidget.graphic = null;
            }
            if (this.highlightedFeature) {
              this.highlightedFeature.remove();
              this.highlightedFeature = null;
            }
          }
        }
      );

      view.ui.add(screenshotExpand, "top-left");
    }
  }

  // _handleLayerListWidget
  private _handleLayerListWidget(
    layerListEnabled: boolean,
    view: MapView
  ): void {
    if (layerListEnabled) {
      const layerListContent = this.layerList ? this.layerList : null;
      this.layerListExpand = new Expand({
        view,
        content: layerListContent,
        mode: "floating",
        expandIconClass: "esri-icon-layer-list",
        expandTooltip: this.layerList.label,
        expanded: true
      });
      watchUtils.whenOnce(this.layerListExpand, "container", () => {
        if (this.layerListExpand.container) {
          const container = this.layerListExpand.container as HTMLElement;
          container.classList.add("expand-content-z-index");
        }
      });
      view.ui.add(this.layerListExpand, "bottom-right");
    }
  }

  // _handleBasemapToggleWidget
  private _handleBasemapToggleWidget(
    basemapToggleEnabled: boolean,
    view: MapView,
    nextBasemap: string
  ): void {
    const nextBaseMapVal = nextBasemap ? nextBasemap : "topo";
    if (basemapToggleEnabled) {
      const basemapToggle = new BasemapToggle({
        view,
        nextBasemap: nextBaseMapVal
      });
      watchUtils.whenOnce(basemapToggle, "container", () => {
        if (basemapToggle.container) {
          const container = basemapToggle.container as HTMLElement;
          container.classList.add("expand-content-z-index");
        }
      });
      view.ui.add(basemapToggle, "bottom-right");
    }
  }

  // _handleSearchWidget
  private _handleSearchWidget(
    searchEnabled: boolean,
    interactiveLegend: InteractiveLegend,
    view: MapView,
    searchConfig: any
  ): void {
    // Get any configured search settings
    if (searchEnabled) {
      const searchProperties: any = {
        view,
        container: document.createElement("div")
      };
      if (searchConfig) {
        if (searchConfig.sources) {
          const sources = searchConfig.sources;

          searchProperties.sources = sources.filter(source => {
            if (source.flayerId && source.url) {
              const layer = view.map.findLayerById(source.flayerId);
              source.layer = layer ? layer : new FeatureLayer(source.url);
            }
            if (source.hasOwnProperty("enableSuggestions")) {
              source.suggestionsEnabled = source.enableSuggestions;
            }
            if (source.hasOwnProperty("searchWithinMap")) {
              source.withinViewEnabled = source.searchWithinMap;
            }

            return source;
          });
        }
        if (
          searchProperties.sources &&
          searchProperties.sources.length &&
          searchProperties.sources.length > 0
        ) {
          searchProperties.includeDefaultSources = false;
        }
        searchProperties.searchAllEnabled = searchConfig.enableSearchingAll
          ? true
          : false;
        if (
          searchConfig.activeSourceIndex &&
          searchProperties.sources &&
          searchProperties.sources.length >= searchConfig.activeSourceIndex
        ) {
          searchProperties.activeSourceIndex = searchConfig.activeSourceIndex;
        }
      }

      const search = new Search(searchProperties);
      this.searchExpand = new Expand({
        view,
        content: search,
        mode: "floating",
        expanded: true,
        expandTooltip: search.label
      });
      interactiveLegend.searchViewModel = search.viewModel;

      watchUtils.whenOnce(this.searchExpand, "container", () => {
        if (this.searchExpand.container) {
          const container = this.searchExpand.container as HTMLElement;
          container.classList.add("expand-content-z-index");
        }
      });

      view.ui.add(this.searchExpand, "top-right");
    }
  }
}

export = InteractiveLegendApp;
