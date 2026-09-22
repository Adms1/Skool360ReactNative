if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "D:/Gradle/caches/9.4.1/transforms/9c62773ecf1ba8462dfae62cc584184e/transformed/hermes-android-250829098.0.16-release/prefab/modules/hermesvm/libs/android.armeabi-v7a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "D:/Gradle/caches/9.4.1/transforms/9c62773ecf1ba8462dfae62cc584184e/transformed/hermes-android-250829098.0.16-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

