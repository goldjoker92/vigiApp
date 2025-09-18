if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/Oscar/.gradle/caches/8.13/transforms/8b58fa16b3b4fa0649400855afae7a3f/transformed/hermes-android-0.79.5-debug/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Oscar/.gradle/caches/8.13/transforms/8b58fa16b3b4fa0649400855afae7a3f/transformed/hermes-android-0.79.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

